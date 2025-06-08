import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css'; // Будет содержать базовые стили
import App from './App';
// import reportWebVitals from './reportWebVitals'; // Эту строку мы удалили

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// reportWebVitals(); // Эту строку мы тоже удалили