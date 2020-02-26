import React from 'react';
import './App.css';
import HiddenMessage from './HiddenMessage'

function App() {
  return (
    <div className="wrapper">
      <h1>Test App</h1>
      <HiddenMessage>
        <div className="message">
          Test message
        </div>
      </HiddenMessage>
    </div>
  );
}

export default App;
