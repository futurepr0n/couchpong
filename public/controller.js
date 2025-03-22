// Get room ID from URL
const urlParams = new URLSearchParams(window.location.search);
let roomId = urlParams.get('room');

// DOM Elements
const throwButton = document.getElementById('throwButton');
const statusDisplay = document.getElementById('statusDisplay');
const roomIdDisplay = document.getElementById('roomId');
const connectionStatus = document.getElementById('connectionStatus');
const manualRoomEntry = document.getElementById('manualRoomEntry');
const manualRoomInput = document.getElementById('manualRoomInput');
const submitRoomButton = document.getElementById('submitRoomButton');

// Set up Socket.io connection
const socket = io();

// Motion sensors flag
let motionPermissionGranted = false;

// If no room ID is provided, show manual entry
if (!roomId) {
  manualRoomEntry.style.display = 'block';
  roomIdDisplay.textContent = 'No room specified';
  connectionStatus.textContent = 'Please enter a room ID to connect';
  connectionStatus.className = 'disconnected';
} else {
  roomIdDisplay.textContent = roomId;
}

// Request iOS motion permission
function requestMotionPermission() {
  // Check if DeviceOrientationEvent or DeviceMotionEvent is available
  if (typeof DeviceOrientationEvent !== 'undefined' && 
      typeof DeviceOrientationEvent.requestPermission === 'function') {
    
    // iOS 13+ devices need to request permission
    DeviceOrientationEvent.requestPermission()
      .then(permissionState => {
        if (permissionState === 'granted') {
          motionPermissionGranted = true;
          enableThrowButton();
          statusDisplay.textContent = 'Motion access granted! Hold to throw.';
        } else {
          statusDisplay.textContent = 'Motion permission denied. Please allow motion sensors and refresh.';
        }
      })
      .catch(console.error);
  } else if (typeof DeviceMotionEvent !== 'undefined' && 
            typeof DeviceMotionEvent.requestPermission === 'function') {
    
    // Alternative try with DeviceMotionEvent
    DeviceMotionEvent.requestPermission()
      .then(permissionState => {
        if (permissionState === 'granted') {
          motionPermissionGranted = true;
          enableThrowButton();
          statusDisplay.textContent = 'Motion access granted! Hold to throw.';
        } else {
          statusDisplay.textContent = 'Motion permission denied. Please allow motion sensors and refresh.';
        }
      })
      .catch(console.error);
  } else {
    // Other devices don't need permission
    motionPermissionGranted = true;
    enableThrowButton();
  }
}

// Called when we're connected to a room and ready to throw
function enableThrowButton() {
  // Only enable if we're connected to a room and have motion permissions (if needed)
  if (socket.connected && roomId) {
    throwButton.disabled = false;
    throwButton.textContent = 'Hold to Throw';
  }
}

// Motion tracking variables
let initialOrientation = { beta: 0, gamma: 0 };
let currentOrientation = { beta: 0, gamma: 0 };
let isThrowing = false;
let throwStartTime = 0;
let orientationHistory = [];
let lastOrientationTime = 0;

// Add a permission button for iOS
const permissionButton = document.createElement('button');
permissionButton.id = 'permissionButton';
permissionButton.textContent = 'Enable Motion Controls';
permissionButton.style.padding = '15px';
permissionButton.style.margin = '15px';
permissionButton.style.backgroundColor = '#2196F3';
permissionButton.style.color = 'white';
permissionButton.style.border = 'none';
permissionButton.style.borderRadius = '5px';
permissionButton.style.fontSize = '16px';
permissionButton.addEventListener('click', requestMotionPermission);

// Insert the permission button before the throw button
throwButton.parentNode.insertBefore(permissionButton, throwButton);

// Initially hide the throw button and show a message to enable motion controls
throwButton.style.display = 'none';
statusDisplay.textContent = 'Please tap "Enable Motion Controls" to play';

// Track phone orientation
window.addEventListener('deviceorientation', (event) => {
  const timestamp = Date.now();
  currentOrientation.beta = event.beta;   // Forward/back tilt (degrees)
  currentOrientation.gamma = event.gamma; // Left/right tilt (degrees)
  
  // If throwing, record orientation with timestamp for velocity calculation
  if (isThrowing) {
    // Only record points at a reasonable interval (every 50ms) to avoid overwhelming
    if (timestamp - lastOrientationTime > 50) {
      orientationHistory.push({
        beta: currentOrientation.beta,
        gamma: currentOrientation.gamma,
        timestamp: timestamp
      });
      lastOrientationTime = timestamp;
    }
  }
  
  // If we're getting orientation events, we can hide the permission button
  if (motionPermissionGranted === false && 
      (event.beta !== null || event.gamma !== null)) {
    motionPermissionGranted = true;
    permissionButton.style.display = 'none';
    throwButton.style.display = 'block';
    enableThrowButton();
  }
});

// Start throw
throwButton.addEventListener('touchstart', (e) => {
  e.preventDefault();
  isThrowing = true;
  throwStartTime = Date.now();
  initialOrientation.beta = currentOrientation.beta;
  initialOrientation.gamma = currentOrientation.gamma;
  
  // Reset history for this throw
  orientationHistory = [{
    beta: initialOrientation.beta,
    gamma: initialOrientation.gamma,
    timestamp: throwStartTime
  }];
  lastOrientationTime = throwStartTime;
  
  statusDisplay.textContent = 'Hold and swing your phone to throw...';
});

// End throw and calculate velocity
throwButton.addEventListener('touchend', (e) => {
  e.preventDefault();
  if (isThrowing) {
    isThrowing = false;
    const throwEndTime = Date.now();
    const throwDuration = (throwEndTime - throwStartTime) / 1000; // in seconds
    
    // Add the final position to history
    orientationHistory.push({
      beta: currentOrientation.beta,
      gamma: currentOrientation.gamma,
      timestamp: throwEndTime
    });
    
    // Calculate motion speed based on orientation history
    let maxAngularSpeed = 0;
    
    if (orientationHistory.length > 1) {
      for (let i = 1; i < orientationHistory.length; i++) {
        const prev = orientationHistory[i-1];
        const curr = orientationHistory[i];
        const dt = (curr.timestamp - prev.timestamp) / 1000; // time diff in seconds
        
        if (dt > 0) {
          const betaChange = Math.abs(curr.beta - prev.beta);
          const gammaChange = Math.abs(curr.gamma - prev.gamma);
          // Angular speed in degrees per second
          const angularSpeed = Math.sqrt(betaChange*betaChange + gammaChange*gammaChange) / dt;
          maxAngularSpeed = Math.max(maxAngularSpeed, angularSpeed);
        }
      }
    }
    
    // Calculate orientation change in radians (first to last point)
    const deltaBeta = (currentOrientation.beta - initialOrientation.beta) * (Math.PI / 180);
    const deltaGamma = (currentOrientation.gamma - initialOrientation.gamma) * (Math.PI / 180);
    
    // Base throw power depends on both angular velocity and throw duration
    // Short, fast throws or longer, controlled throws can both be effective
    const speedFactor = Math.min(maxAngularSpeed / 100, 2); // Cap at 2x, normalize by 100deg/s
    const durationFactor = Math.min(throwDuration / 1.5, 1); // Duration factor maxes at 1.5 seconds
    
    // Combined power factor
    const powerFactor = 0.5 + (speedFactor * 0.8) + (durationFactor * 0.2);
    
    // Base speed with dynamic adjustment
    const baseSpeed = 15; 
    const speed = baseSpeed * powerFactor;
    
    // Direction calculation - unchanged
    const direction = {
      x: -Math.sin(deltaGamma),              // Left/right tilt affects x
      y: Math.sin(deltaBeta),                // Forward tilt affects y
      z: Math.cos(deltaGamma) * Math.cos(deltaBeta) // Forward motion
    };
    
    // Normalize direction vector to ensure consistent throwing power
    const dirMagnitude = Math.sqrt(
      direction.x * direction.x + 
      direction.y * direction.y + 
      direction.z * direction.z
    );
    
    if (dirMagnitude > 0) {
      direction.x /= dirMagnitude;
      direction.y /= dirMagnitude;
      direction.z /= dirMagnitude;
    }
    
    const velocity = {
      x: direction.x * speed,
      y: direction.y * speed,
      z: direction.z * speed
    };
    
    // Minimal motion detection - with better conditions
    const totalMotion = Math.abs(deltaBeta) + Math.abs(deltaGamma);
    const minimalMotionThreshold = 0.15; // Slightly increased threshold
    
    if (totalMotion < minimalMotionThreshold || maxAngularSpeed < 20) {
      // Default throw with slight random variation for natural feel
      velocity.x = 0 + (Math.random() * 2 - 1); // Small random x variation
      velocity.y = 4;  // Slightly lower than before
      velocity.z = 8;  // Slightly lower than before
      statusDisplay.textContent = 'Minimal motion detected. Using default throw.';
    } else {
      statusDisplay.textContent = `Throw power: ${Math.round(powerFactor * 100)}%. Speed: ${Math.round(speed)}`;
    }
    
    console.log('Motion stats:', {
      deltaAngles: { beta: deltaBeta, gamma: deltaGamma },
      maxAngularSpeed: maxAngularSpeed,
      throwDuration: throwDuration,
      powerFactor: powerFactor,
      speed: speed
    });
    
    console.log('Sent velocity:', velocity);
    socket.emit('throw', velocity);
  }
});

// Socket.io event handlers
socket.on('connect', () => {
  connectionStatus.textContent = 'Connected to server';
  connectionStatus.className = 'connected';
  
  // If we have a room ID, join it
  if (roomId) {
    joinRoom(roomId);
  }
});

socket.on('disconnect', () => {
  throwButton.disabled = true;
  connectionStatus.textContent = 'Disconnected from server';
  connectionStatus.className = 'disconnected';
  statusDisplay.textContent = 'Connection lost. Please refresh the page.';
});

socket.on('roomJoined', (data) => {
  roomId = data.roomId;
  roomIdDisplay.textContent = roomId;
  enableThrowButton();
  connectionStatus.textContent = 'Connected to game room';
  connectionStatus.className = 'connected';
  
  if (motionPermissionGranted) {
    statusDisplay.textContent = 'Hold to throw';
    throwButton.style.display = 'block';
  } else {
    statusDisplay.textContent = 'Please enable motion controls to throw';
    // We'll show the permission button, but throw button stays hidden
    permissionButton.style.display = 'block';
    throwButton.style.display = 'none';
  }
  
  // Hide manual entry if it was shown
  manualRoomEntry.style.display = 'none';
});

socket.on('roomError', (data) => {
  connectionStatus.textContent = `Error: ${data.message}`;
  connectionStatus.className = 'roomError';
  throwButton.disabled = true;
  
  // Show manual entry to allow correction
  manualRoomEntry.style.display = 'block';
  statusDisplay.textContent = 'Please enter a valid room ID';
});

// Function to join a room
function joinRoom(id) {
  if (!id) return;
  
  connectionStatus.textContent = 'Connecting to game room...';
  connectionStatus.className = 'connecting';
  socket.emit('joinRoom', id);
}

// Handle manual room ID submission
submitRoomButton.addEventListener('click', () => {
  const manualId = manualRoomInput.value.trim();
  if (manualId) {
    roomId = manualId;
    roomIdDisplay.textContent = roomId;
    joinRoom(roomId);
    
    // Update URL without refreshing
    const newUrl = new URL(window.location.href);
    newUrl.searchParams.set('room', roomId);
    window.history.pushState({}, '', newUrl);
  } else {
    alert('Please enter a valid Room ID');
  }
});