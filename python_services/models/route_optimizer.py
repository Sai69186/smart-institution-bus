"""
route_optimizer.py
Implements 4 route optimization algorithms for Vignan LARA campus transit.
  - Dijkstra
  - A* Search
  - Genetic Algorithm
  - Reinforcement Learning (Q-Learning)
"""
import heapq, random, math, numpy as np
from typing import Dict, List, Tuple, Optional

# ── Stop coordinates (lat, lng) ───────────────────────────────────────────────
STOP_COORDS: Dict[str, Tuple[float, float]] = {
    'Vadlamudi Bus Stand':       (16.2472, 80.5418),
    'Guntur Highway Gate':       (16.2420, 80.5510),
    'VLITS Main Gate':           (16.2365, 80.5590),
    'Tenali Road Stop':          (16.2488, 80.5762),
    'Pedaparupudi Junction':     (16.2440, 80.5670),
    'Chebrolu Cross Roads':      (16.2390, 80.5640),
    'Kollipara Village Stop':    (16.2318, 80.5428),
    'Mangalagiri Bypass':        (16.2350, 80.5530),
    'Hostel Block VLITS':        (16.2355, 80.5600),
    'Vignan LARA Main Campus':   (16.2345, 80.5613),
    'Amaravati Capital Stop':    (16.2610, 80.5230),
    'Undavalli Junction':        (16.2510, 80.5340),
    'Tadepalli Gate':            (16.2455, 80.5420),
    'Guntur RTC Complex':        (16.3070, 80.4370),
    'Brodipet Stop':             (16.2890, 80.4780),
    'Nallapadu Gate':            (16.2680, 80.5050),
}

DESTINATION = 'Vignan LARA Main Campus'


def haversine_km(a: str, b: str) -> float:
    """Great-circle distance in km between two named stops."""
    lat1, lng1 = STOP_COORDS[a]
    lat2, lng2 = STOP_COORDS[b]
    R = 6371
    dlat = math.radians(lat2 - lat1)
    dlng = math.radians(lng2 - lng1)
    s = math.sin(dlat/2)**2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlng/2)**2
    return R * 2 * math.asin(math.sqrt(s))


def build_graph(stops: List[str], traffic_factor: float = 1.0) -> Dict[str, Dict[str, float]]:
    """Full connected graph with Haversine distances scaled by traffic factor."""
    graph: Dict[str, Dict[str, float]] = {s: {} for s in stops}
    for i, a in enumerate(stops):
        for j, b in enumerate(stops):
            if i != j:
                graph[a][b] = haversine_km(a, b) * traffic_factor
    return graph


# ────────────────────────────────────────────────────────────────────────────────
# 1. DIJKSTRA
# ────────────────────────────────────────────────────────────────────────────────
def dijkstra(stops: List[str], start: str, traffic_factor: float = 1.0) -> dict:
    """
    Calculates the absolute shortest path from start through all stops to campus.
    Returns ordered stop sequence + total distance.
    """
    graph = build_graph(stops, traffic_factor)
    n     = len(stops)

    dist  = {s: float('inf') for s in stops}
    prev  = {s: None for s in stops}
    dist[start] = 0.0
    pq = [(0.0, start)]

    while pq:
        d, u = heapq.heappop(pq)
        if d > dist[u]:
            continue
        for v, w in graph[u].items():
            nd = d + w
            if nd < dist[v]:
                dist[v] = nd
                prev[v] = u
                heapq.heappush(pq, (nd, v))

    # Reconstruct path to destination
    path = []
    node = DESTINATION
    while node:
        path.append(node)
        node = prev[node]
    path.reverse()

    total_km = dist[DESTINATION]
    eta_mins = round((total_km / 30) * 60, 1)   # assume 30 km/h avg

    return {
        'algorithm':    'Dijkstra',
        'path':         path,
        'total_km':     round(total_km, 2),
        'eta_mins':     eta_mins,
        'stops_count':  len(path),
    }


# ────────────────────────────────────────────────────────────────────────────────
# 2. A* SEARCH
# ────────────────────────────────────────────────────────────────────────────────
def heuristic(a: str) -> float:
    """Straight-line distance to campus (admissible heuristic)."""
    return haversine_km(a, DESTINATION)


def astar(stops: List[str], start: str, traffic_factor: float = 1.0) -> dict:
    """
    Combines Dijkstra with spatial heuristic for faster convergence toward campus.
    """
    graph = build_graph(stops, traffic_factor)

    g_score = {s: float('inf') for s in stops}
    f_score = {s: float('inf') for s in stops}
    came_from = {}
    g_score[start] = 0.0
    f_score[start] = heuristic(start)

    open_set = [(f_score[start], start)]

    while open_set:
        _, current = heapq.heappop(open_set)
        if current == DESTINATION:
            break
        for neighbor, w in graph[current].items():
            tentative_g = g_score[current] + w
            if tentative_g < g_score[neighbor]:
                came_from[neighbor] = current
                g_score[neighbor]   = tentative_g
                f_score[neighbor]   = tentative_g + heuristic(neighbor)
                heapq.heappush(open_set, (f_score[neighbor], neighbor))

    path = []
    node = DESTINATION
    while node in came_from:
        path.append(node)
        node = came_from[node]
    path.append(start)
    path.reverse()

    total_km = g_score[DESTINATION]
    eta_mins = round((total_km / 30) * 60, 1)

    return {
        'algorithm':   'A* Search',
        'path':        path,
        'total_km':    round(total_km, 2),
        'eta_mins':    eta_mins,
        'stops_count': len(path),
    }


# ────────────────────────────────────────────────────────────────────────────────
# 3. GENETIC ALGORITHM
# ────────────────────────────────────────────────────────────────────────────────
def _route_cost(order: List[str], traffic_factor: float) -> float:
    total = 0.0
    prev  = order[0]
    for stop in order[1:]:
        total += haversine_km(prev, stop) * traffic_factor
        prev = stop
    return total


def genetic_algorithm(
    stops: List[str],
    start: str,
    traffic_factor: float = 1.0,
    pop_size: int = 80,
    generations: int = 200,
) -> dict:
    """
    Iteratively evolves optimal multi-bus stop sequences to minimise total distance.
    """
    # Stops to order (exclude start and destination — they're fixed)
    middle = [s for s in stops if s != start and s != DESTINATION]
    if not middle:
        return dijkstra(stops, start, traffic_factor)

    def create_individual():
        ind = middle.copy()
        random.shuffle(ind)
        return [start] + ind + [DESTINATION]

    def crossover(p1, p2):
        mid = middle.copy()
        cut = random.randint(1, len(mid) - 1)
        child_mid = p1[1:1+cut] + [s for s in p2[1:-1] if s not in p1[1:1+cut]]
        return [start] + child_mid + [DESTINATION]

    def mutate(ind, rate=0.15):
        ind = ind[:]
        for i in range(1, len(ind) - 1):
            if random.random() < rate:
                j = random.randint(1, len(ind) - 2)
                ind[i], ind[j] = ind[j], ind[i]
        return ind

    population = [create_individual() for _ in range(pop_size)]
    best       = min(population, key=lambda x: _route_cost(x, traffic_factor))

    for _ in range(generations):
        # Tournament selection
        scored = sorted(population, key=lambda x: _route_cost(x, traffic_factor))
        survivors = scored[:pop_size // 2]

        children = []
        while len(children) < pop_size // 2:
            p1, p2 = random.sample(survivors, 2)
            child  = mutate(crossover(p1, p2))
            children.append(child)

        population = survivors + children
        gen_best   = min(population, key=lambda x: _route_cost(x, traffic_factor))
        if _route_cost(gen_best, traffic_factor) < _route_cost(best, traffic_factor):
            best = gen_best

    total_km = _route_cost(best, traffic_factor)
    eta_mins = round((total_km / 30) * 60, 1)

    return {
        'algorithm':   'Genetic Algorithm',
        'path':        best,
        'total_km':    round(total_km, 2),
        'eta_mins':    eta_mins,
        'stops_count': len(best),
        'generations': generations,
    }


# ────────────────────────────────────────────────────────────────────────────────
# 4. REINFORCEMENT LEARNING (Q-Learning)
# ────────────────────────────────────────────────────────────────────────────────
def rl_qlearning(
    stops: List[str],
    start: str,
    traffic_factor: float = 1.0,
    episodes: int = 500,
    alpha: float = 0.3,
    gamma: float = 0.9,
    epsilon: float = 0.2,
) -> dict:
    """
    Q-Learning agent learns optimal stop traversal order to minimise distance.
    State = current stop, Action = next unvisited stop.
    """
    n     = len(stops)
    idx   = {s: i for i, s in enumerate(stops)}
    graph = build_graph(stops, traffic_factor)

    Q = np.zeros((n, n))
    best_path, best_cost = [], float('inf')

    for ep in range(episodes):
        visited = set()
        state   = start
        path    = [start]
        visited.add(start)
        total   = 0.0

        while DESTINATION not in visited or len(visited) < n:
            unvisited = [s for s in stops if s not in visited]
            if not unvisited:
                break

            # Epsilon-greedy action selection
            if random.random() < epsilon:
                action = random.choice(unvisited)
            else:
                q_vals = [(Q[idx[state], idx[s]], s) for s in unvisited]
                action = max(q_vals, key=lambda x: x[0])[1]

            # Reward: negative distance (shorter = better)
            reward = -graph[state][action]
            total += graph[state][action]

            next_unvisited = [s for s in stops if s not in visited and s != action]
            max_q_next = max([Q[idx[action], idx[s]] for s in next_unvisited], default=0)

            # Q-update
            Q[idx[state], idx[action]] += alpha * (
                reward + gamma * max_q_next - Q[idx[state], idx[action]]
            )

            visited.add(action)
            path.append(action)
            state = action

            if action == DESTINATION:
                break

        if DESTINATION not in path:
            path.append(DESTINATION)
            total += graph[state][DESTINATION]

        if total < best_cost:
            best_cost = total
            best_path = path[:]

        epsilon = max(0.01, epsilon * 0.99)   # decay exploration

    eta_mins = round((best_cost / 30) * 60, 1)

    return {
        'algorithm':   'Reinforcement Learning',
        'path':        best_path,
        'total_km':    round(best_cost, 2),
        'eta_mins':    eta_mins,
        'stops_count': len(best_path),
        'episodes':    episodes,
    }
