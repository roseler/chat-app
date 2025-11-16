import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import api from '../utils/api';
import { setAuthToken, setUser } from '../utils/auth';

const Register = () => {
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [passwordStrength, setPasswordStrength] = useState({ score: 0, feedback: [] });
  const navigate = useNavigate();

  const checkPasswordStrength = (pwd) => {
    const feedback = [];
    let score = 0;

    if (pwd.length >= 8) {
      score += 1;
    } else {
      feedback.push('At least 8 characters');
    }

    if (/[A-Z]/.test(pwd)) {
      score += 1;
    } else {
      feedback.push('One uppercase letter');
    }

    if (/[a-z]/.test(pwd)) {
      score += 1;
    } else {
      feedback.push('One lowercase letter');
    }

    if (/[0-9]/.test(pwd)) {
      score += 1;
    } else {
      feedback.push('One number');
    }

    return { score, feedback };
  };

  const handlePasswordChange = (e) => {
    const value = e.target.value;
    setPassword(value);
    if (value) {
      setPasswordStrength(checkPasswordStrength(value));
    } else {
      setPasswordStrength({ score: 0, feedback: [] });
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const response = await api.post('/auth/register', { username, email, password });
      setAuthToken(response.data.token);
      setUser(response.data.user);
      navigate('/chat');
    } catch (err) {
      const errorMessage = err.response?.data?.error || 'Registration failed';
      if (process.env.NODE_ENV === 'development') {
        console.error('Registration error:', err);
      }
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-container">
      <div className="auth-box">
        <h2>Register</h2>
        <form className="auth-form" onSubmit={handleSubmit}>
          <input
            type="text"
            placeholder="Username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
            autoFocus
          />
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <div className="password-input-wrapper">
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={handlePasswordChange}
              required
              minLength={8}
            />
            {password && (
              <div className="password-strength">
                <div className="password-strength-bar">
                  <div 
                    className={`password-strength-fill strength-${passwordStrength.score}`}
                    style={{ width: `${(passwordStrength.score / 4) * 100}%` }}
                  ></div>
                </div>
                {passwordStrength.feedback.length > 0 && (
                  <div className="password-feedback">
                    <small>Password must contain:</small>
                    <ul>
                      {passwordStrength.feedback.map((item, idx) => (
                        <li key={idx}>{item}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>
          {error && <div className="auth-error">{error}</div>}
          <button type="submit" disabled={loading}>
            {loading ? 'Registering...' : 'Register'}
          </button>
        </form>
        <div className="auth-link">
          Already have an account? <Link to="/login">Login</Link>
        </div>
      </div>
    </div>
  );
};

export default Register;

