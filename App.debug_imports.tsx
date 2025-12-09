import React from 'react';
// Test Imports
import { GameEngine } from './game/GameEngine';
import { UIOverlay } from './components/UIOverlay';
import { io } from 'socket.io-client';

const App: React.FC = () => {
    // Just force a reference to ensure webpack/vite includes them
    console.log("GameEngine class:", GameEngine);
    console.log("UIOverlay component:", UIOverlay);
    console.log("Socket IO:", io);

    return (
        <div style={{ color: 'white', fontSize: '40px', padding: '50px' }}>
            <h1>IMPORTS TEST PASS</h1>
            <p>If you see this, all modules loaded without crashing.</p>
        </div>
    );
};

export default App;
