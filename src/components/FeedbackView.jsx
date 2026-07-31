import React, { useContext, useState } from 'react';
import { AppContext } from '../context/AppContext';
import { MessageSquare, Star, Send } from 'lucide-react';

const FeedbackView = ({ studentOnly = false }) => {
  const { feedbacks, addFeedback, currentUser, studentFeedbacks } = useContext(AppContext);
  const [category, setCategory] = useState('Delay issues');
  const [rating, setRating] = useState(5);
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const displayFeedbacks = studentOnly
    ? studentFeedbacks
    : feedbacks;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!message.trim()) return;

    setSubmitting(true);
    await addFeedback({
      name: currentUser?.name || 'Anonymous',
      category,
      rating,
      message: message.trim()
    });
    setSubmitting(false);
    setMessage('');
    setRating(5);
  };

  return (
    <div className={studentOnly ? '' : 'two-col-grid'}>

      <div className="glass-card">
        <h3 className="glass-card-title">
          <MessageSquare size={18} />
          <span>{studentOnly ? 'Submit Feedback or Complaint' : 'Submit Service Feedback'}</span>
        </h3>
        <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: 16 }}>
          {studentOnly
            ? 'Report delays, bus conditions, or route issues. Your ticket is sent to the transport office.'
            : 'Let us know how to improve campus transit operations'}
        </p>

        {studentOnly && currentUser && (
          <div style={{ padding: '10px 14px', borderRadius: 10, background: 'var(--cyan-soft)', marginBottom: 14, fontSize: '0.78rem' }}>
            Submitting as <strong>{currentUser.name}</strong> · {currentUser.studentId || 'Student'}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 16 }}>
          {!studentOnly && (
            <div className="form-group">
              <label className="form-label">Full Name (Optional)</label>
              <input type="text" className="form-input" placeholder="e.g. Priya Patel (leave blank for anonymous)" />
            </div>
          )}

          <div className="form-group">
            <label className="form-label">Feedback Category</label>
            <select className="form-input" value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="Delay issues">Delay Issues / Timing deviations</option>
              <option value="Driver behavior">Driver Behavior / Safety</option>
              <option value="Bus condition">Bus Condition / Cleanliness</option>
              <option value="Route issues">Route / Stop Coverage</option>
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">Rating Score</label>
            <div style={{ display: 'flex', gap: 6 }}>
              {[1, 2, 3, 4, 5].map(val => (
                <Star
                  key={val}
                  size={24}
                  onClick={() => setRating(val)}
                  fill={val <= rating ? 'var(--amber)' : 'none'}
                  stroke={val <= rating ? 'var(--amber)' : 'var(--text-muted)'}
                  style={{ cursor: 'pointer', transition: 'transform 0.1s' }}
                />
              ))}
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Message Details</label>
            <textarea
              rows={4}
              className="form-input"
              placeholder="Provide details about your commute issue..."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              style={{ resize: 'none', fontFamily: 'var(--font-sans)' }}
              required
            />
          </div>

          <button type="submit" className="btn btn-primary" style={{ width: '100%' }} disabled={submitting}>
            <Send size={14} />
            <span>{submitting ? 'Submitting...' : 'Submit Feedback'}</span>
          </button>
        </form>
      </div>

      <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', marginTop: studentOnly ? 20 : 0 }}>
        <h3 className="glass-card-title">
          {studentOnly ? 'My Submitted Feedback' : 'Recent Feedback Logs'}
        </h3>
        <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: 16 }}>
          Track ticket review progression
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, flex: 1, overflowY: 'auto', maxHeight: 420 }}>
          {displayFeedbacks.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
              {studentOnly ? 'You have not submitted any feedback yet.' : 'No feedback logged.'}
            </div>
          ) : (
            displayFeedbacks.map(f => (
              <div
                key={f.id}
                style={{
                  padding: 12, borderRadius: 10,
                  background: 'rgba(255,255,255,0.015)',
                  border: '1px solid var(--card-border)',
                  display: 'flex', flexDirection: 'column', gap: 6
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.03)', paddingBottom: 6 }}>
                  <span style={{ fontSize: '0.8rem', fontWeight: 'bold' }}>{f.name}</span>
                  <span className={`badge ${
                    f.status === 'Resolved' ? 'badge-active' : f.status === 'In Progress' ? 'badge-warning' : 'badge-danger'
                  }`} style={{ fontSize: '0.65rem' }}>{f.status}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Category: <strong style={{ color: 'var(--text-primary)' }}>{f.category}</strong></span>
                  <span style={{ color: 'var(--text-muted)' }}>{f.date}</span>
                </div>
                <div style={{ display: 'flex', gap: 2 }}>
                  {[1, 2, 3, 4, 5].map(v => (
                    <Star key={v} size={10} fill={v <= f.rating ? 'var(--amber)' : 'none'} stroke={v <= f.rating ? 'var(--amber)' : 'var(--text-muted)'} />
                  ))}
                </div>
                <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--text-secondary)' }}>"{f.message}"</p>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default FeedbackView;
