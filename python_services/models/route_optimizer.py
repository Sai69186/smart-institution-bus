"""
route_optimizer.py  —  Multi-tenant, dynamic-stop route optimizer.

All algorithms now accept stops as a list of dicts:
  { "name": str, "lat": float, "lng": float }

No hardcoded STOP_COORDS — every institution passes its own coordinates.
Campus / destination is the LAST item in the stops list (highest lat/lng
closest to campus, or explicitly flagged via is_destination=True).

Algorithms:
  1. Nearest-Neighbor + 2-opt   (fast, good quality, default)
  2. Dijkstra                   (shortest path on full graph)
  3. A* Search                  (Dijkstra + haversine heuristic)
  4. Genetic Algorithm          (population-based, best quality)
  5. Q-Learning RL              (ε-greedy, educational demo)
"""

import heapq, random, math, time
import numpy as np
from typing import Dict, List, Tuple, Optional


# ── Haversine distance (works on raw lat/lng, not stop names) ────────────────
def haversine_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    R = 6371.0
    dlat = math.radians(lat2 - lat1)
    dlng = math.radians(lng2 - lng1)
    a = math.sin(dlat / 2) ** 2 + \
        math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * \
        math.sin(dlng / 2) ** 2
    return R * 2 * math.asin(math.sqrt(max(0.0, a)))


def stop_dist(a: dict, b: dict) -> float:
    """Haversine distance between two stop dicts."""
    return haversine_km(a['lat'], a['lng'], b['lat'], b['lng'])


def build_dist_matrix(stops: List[dict]) -> List[List[float]]:
    """Full NxN distance matrix."""
    n = len(stops)
    d = [[0.0] * n for _ in range(n)]
    for i in range(n):
        for j in range(n):
            if i != j:
                d[i][j] = stop_dist(stops[i], stops[j])
    return d


def route_cost(order: List[int], dist: List[List[float]], traffic_factor: float = 1.0) -> float:
    total = 0.0
    for k in range(len(order) - 1):
        total += dist[order[k]][order[k + 1]] * traffic_factor
    return total


def route_km(stop_order: List[dict], traffic_factor: float = 1.0) -> float:
    total = 0.0
    for k in range(len(stop_order) - 1):
        total += stop_dist(stop_order[k], stop_order[k + 1]) * traffic_factor
    return total


# ── 1. NEAREST-NEIGHBOR + 2-OPT (default, fastest) ──────────────────────────
def nearest_neighbor_2opt(stops: List[dict], start_idx: int, dest_idx: int,
                          traffic_factor: float = 1.0) -> dict:
    """
    Greedy nearest-neighbor tour through middle stops,
    then 2-opt improvement pass.  Start and destination are fixed.
    """
    n    = len(stops)
    dist = build_dist_matrix(stops)
    middle_idx = [i for i in range(n) if i != start_idx and i != dest_idx]

    # Nearest-neighbor
    ordered = [start_idx]
    remaining = middle_idx[:]
    while remaining:
        last = ordered[-1]
        best_i, best_d = 0, float('inf')
        for idx, s in enumerate(remaining):
            d = dist[last][s]
            if d < best_d:
                best_d = d; best_i = idx
        ordered.append(remaining.pop(best_i))
    ordered.append(dest_idx)

    # 2-opt on the middle segment (keep start/dest fixed)
    improved = True
    while improved:
        improved = False
        for i in range(1, len(ordered) - 2):
            for j in range(i + 1, len(ordered) - 1):
                a, b, c, d = ordered[i-1], ordered[i], ordered[j], ordered[j+1]
                before = dist[a][b] + dist[c][d]
                after  = dist[a][c] + dist[b][d]
                if after < before - 1e-9:
                    ordered[i:j+1] = ordered[i:j+1][::-1]
                    improved = True

    total_km = route_cost(ordered, dist, traffic_factor)
    path     = [stops[i] for i in ordered]
    return {
        'algorithm':   'Nearest-Neighbor + 2-opt',
        'path':        [s['name'] for s in path],
        'path_coords': [{'name': s['name'], 'lat': s['lat'], 'lng': s['lng']} for s in path],
        'total_km':    round(total_km, 2),
        'eta_mins':    round((total_km / 30) * 60, 1),
        'stops_count': len(path),
    }


# ── 2. DIJKSTRA ──────────────────────────────────────────────────────────────
def dijkstra(stops: List[dict], start_idx: int, dest_idx: int,
             traffic_factor: float = 1.0) -> dict:
    n    = len(stops)
    dist_m = build_dist_matrix(stops)

    dist_arr = [float('inf')] * n
    prev     = [None] * n
    dist_arr[start_idx] = 0.0
    pq = [(0.0, start_idx)]

    while pq:
        d, u = heapq.heappop(pq)
        if d > dist_arr[u]:
            continue
        for v in range(n):
            if v == u:
                continue
            nd = d + dist_m[u][v] * traffic_factor
            if nd < dist_arr[v]:
                dist_arr[v] = nd
                prev[v]     = u
                heapq.heappush(pq, (nd, v))

    # Reconstruct
    path_idx = []
    node = dest_idx
    while node is not None:
        path_idx.append(node)
        node = prev[node]
    path_idx.reverse()

    total_km = dist_arr[dest_idx]
    path     = [stops[i] for i in path_idx]
    return {
        'algorithm':   'Dijkstra',
        'path':        [s['name'] for s in path],
        'path_coords': [{'name': s['name'], 'lat': s['lat'], 'lng': s['lng']} for s in path],
        'total_km':    round(total_km, 2),
        'eta_mins':    round((total_km / 30) * 60, 1),
        'stops_count': len(path),
    }


# ── 3. A* SEARCH ─────────────────────────────────────────────────────────────
def astar(stops: List[dict], start_idx: int, dest_idx: int,
          traffic_factor: float = 1.0) -> dict:
    n      = len(stops)
    dist_m = build_dist_matrix(stops)
    dest   = stops[dest_idx]

    def h(i):
        return haversine_km(stops[i]['lat'], stops[i]['lng'], dest['lat'], dest['lng'])

    g = [float('inf')] * n
    came_from = [None] * n
    g[start_idx] = 0.0
    open_set = [(g[start_idx] + h(start_idx), start_idx)]

    while open_set:
        _, current = heapq.heappop(open_set)
        if current == dest_idx:
            break
        for neighbor in range(n):
            if neighbor == current:
                continue
            tentative = g[current] + dist_m[current][neighbor] * traffic_factor
            if tentative < g[neighbor]:
                came_from[neighbor] = current
                g[neighbor]         = tentative
                heapq.heappush(open_set, (tentative + h(neighbor), neighbor))

    path_idx = []
    node = dest_idx
    while node is not None:
        path_idx.append(node)
        node = came_from[node]
    path_idx.reverse()

    total_km = g[dest_idx]
    path     = [stops[i] for i in path_idx]
    return {
        'algorithm':   'A* Search',
        'path':        [s['name'] for s in path],
        'path_coords': [{'name': s['name'], 'lat': s['lat'], 'lng': s['lng']} for s in path],
        'total_km':    round(total_km, 2),
        'eta_mins':    round((total_km / 30) * 60, 1),
        'stops_count': len(path),
    }


# ── 4. GENETIC ALGORITHM ─────────────────────────────────────────────────────
def genetic_algorithm(stops: List[dict], start_idx: int, dest_idx: int,
                      traffic_factor: float = 1.0,
                      pop_size: int = 60, generations: int = 150) -> dict:
    n      = len(stops)
    dist_m = build_dist_matrix(stops)
    middle = [i for i in range(n) if i != start_idx and i != dest_idx]

    if not middle:
        return nearest_neighbor_2opt(stops, start_idx, dest_idx, traffic_factor)

    def make_ind():
        m = middle[:]
        random.shuffle(m)
        return [start_idx] + m + [dest_idx]

    def cost(ind):
        return route_cost(ind, dist_m, traffic_factor)

    def crossover(p1, p2):
        cut   = random.randint(1, len(middle))
        taken = set(p1[1:1 + cut])
        rest  = [g for g in p2[1:-1] if g not in taken]
        return [start_idx] + p1[1:1 + cut] + rest + [dest_idx]

    def mutate(ind, rate=0.15):
        ind = ind[:]
        for i in range(1, len(ind) - 1):
            if random.random() < rate:
                j = random.randint(1, len(ind) - 2)
                ind[i], ind[j] = ind[j], ind[i]
        return ind

    population = [make_ind() for _ in range(pop_size)]
    best       = min(population, key=cost)

    for _ in range(generations):
        scored    = sorted(population, key=cost)
        survivors = scored[:pop_size // 2]
        children  = []
        while len(children) < pop_size // 2:
            p1, p2 = random.sample(survivors, 2)
            children.append(mutate(crossover(p1, p2)))
        population = survivors + children
        gen_best   = min(population, key=cost)
        if cost(gen_best) < cost(best):
            best = gen_best

    total_km = cost(best)
    path     = [stops[i] for i in best]
    return {
        'algorithm':   'Genetic Algorithm',
        'path':        [s['name'] for s in path],
        'path_coords': [{'name': s['name'], 'lat': s['lat'], 'lng': s['lng']} for s in path],
        'total_km':    round(total_km, 2),
        'eta_mins':    round((total_km / 30) * 60, 1),
        'stops_count': len(path),
        'generations': generations,
    }


# ── 5. Q-LEARNING RL ─────────────────────────────────────────────────────────
def rl_qlearning(stops: List[dict], start_idx: int, dest_idx: int,
                 traffic_factor: float = 1.0,
                 episodes: int = 300, alpha: float = 0.3,
                 gamma: float = 0.9, epsilon: float = 0.2) -> dict:
    n      = len(stops)
    dist_m = build_dist_matrix(stops)
    Q      = np.zeros((n, n))
    best_path, best_cost = [], float('inf')

    for _ in range(episodes):
        visited = {start_idx}
        state   = start_idx
        path    = [start_idx]
        total   = 0.0

        while True:
            unvisited = [i for i in range(n) if i not in visited]
            if not unvisited:
                break
            # prefer destination when it's the only unvisited
            if len(unvisited) == 1 and unvisited[0] == dest_idx:
                action = dest_idx
            elif random.random() < epsilon:
                action = random.choice(unvisited)
            else:
                q_vals = [(Q[state][i], i) for i in unvisited]
                action = max(q_vals, key=lambda x: x[0])[1]

            reward   = -(dist_m[state][action] * traffic_factor)
            total   += dist_m[state][action] * traffic_factor
            next_uv  = [i for i in range(n) if i not in visited and i != action]
            max_next = max([Q[action][i] for i in next_uv], default=0)
            Q[state][action] += alpha * (reward + gamma * max_next - Q[state][action])

            visited.add(action)
            path.append(action)
            state = action
            if action == dest_idx:
                break

        if dest_idx not in path:
            total += dist_m[state][dest_idx] * traffic_factor
            path.append(dest_idx)

        if total < best_cost:
            best_cost = total
            best_path = path[:]

        epsilon = max(0.01, epsilon * 0.995)

    path_stops = [stops[i] for i in best_path]
    return {
        'algorithm':   'Reinforcement Learning (Q-Learning)',
        'path':        [s['name'] for s in path_stops],
        'path_coords': [{'name': s['name'], 'lat': s['lat'], 'lng': s['lng']} for s in path_stops],
        'total_km':    round(best_cost, 2),
        'eta_mins':    round((best_cost / 30) * 60, 1),
        'stops_count': len(path_stops),
        'episodes':    episodes,
    }


# ── AUDIT HELPER: before/after comparison ───────────────────────────────────
def audit_route(stops: List[dict], traffic_factor: float = 1.0) -> dict:
    """
    Compute before (input order) vs after (NN+2opt) total distance.
    Useful for verifying the optimizer is actually improving routes.
    """
    if len(stops) < 2:
        return {'before_km': 0, 'after_km': 0, 'improvement_km': 0, 'improvement_pct': 0}

    before_km = route_km(stops, traffic_factor)

    start_idx = 0
    dest_idx  = len(stops) - 1
    result    = nearest_neighbor_2opt(stops, start_idx, dest_idx, traffic_factor)
    after_km  = result['total_km']

    improvement_km  = round(before_km - after_km, 3)
    improvement_pct = round((improvement_km / before_km) * 100, 1) if before_km > 0 else 0

    return {
        'before_km':       round(before_km, 2),
        'after_km':        after_km,
        'before_order':    [s['name'] for s in stops],
        'after_order':     result['path'],
        'improvement_km':  improvement_km,
        'improvement_pct': improvement_pct,
    }
