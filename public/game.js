// Get room ID from URL
const urlParams = new URLSearchParams(window.location.search);
const roomId = urlParams.get('room');
if (!roomId) {
  alert('Room ID is missing. Redirecting to home page...');
  window.location.href = '/';
}

// Scene setup
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 5, -5);
camera.lookAt(0, 0, 0);

const renderer = new THREE.WebGLRenderer();
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

// Physics setup - Ensure strong gravity
const world = new CANNON.World();
world.gravity.set(0, -15, 0); // Increased gravity for more realistic physics
world.defaultContactMaterial.friction = 0.5;
world.solver.iterations = 10; // More iterations for stable physics

// Table
const tableGeometry = new THREE.PlaneGeometry(4, 8);
const tableMaterial = new THREE.MeshBasicMaterial({ color: 0x228B22 });
const tableMesh = new THREE.Mesh(tableGeometry, tableMaterial);
tableMesh.rotation.x = -Math.PI / 2;
scene.add(tableMesh);

const tableBody = new CANNON.Body({ mass: 0 });
tableBody.addShape(new CANNON.Plane());
tableBody.quaternion.setFromAxisAngle(new CANNON.Vec3(1, 0, 0), -Math.PI / 2);
world.addBody(tableBody);
tableBody.material = new CANNON.Material();
tableBody.material.restitution = 0.5; // Ball bounce factor

// Add table boundaries to prevent ball from rolling off
function createBoundary(position, size, quaternion) {
  // Visual representation
  const boundaryGeom = new THREE.BoxGeometry(size.x, size.y, size.z);
  const boundaryMat = new THREE.MeshBasicMaterial({ color: 0x8B4513, transparent: true, opacity: 0.5 });
  const boundaryMesh = new THREE.Mesh(boundaryGeom, boundaryMat);
  boundaryMesh.position.copy(position);
  if (quaternion) boundaryMesh.quaternion.copy(quaternion);
  scene.add(boundaryMesh);

  // Physics body
  const boundaryBody = new CANNON.Body({ mass: 0 });
  boundaryBody.addShape(new CANNON.Box(new CANNON.Vec3(size.x/2, size.y/2, size.z/2)));
  boundaryBody.position.copy(position);
  if (quaternion) boundaryBody.quaternion.copy(quaternion);
  boundaryBody.material = new CANNON.Material({ restitution: 0.7 });
  world.addBody(boundaryBody);

  return { mesh: boundaryMesh, body: boundaryBody };
}

// Create table boundaries
const tableWidth = 4;
const tableLength = 8;
const boundaryHeight = 0.2;
const boundaryThickness = 0.1;

// Left boundary
createBoundary(
  new CANNON.Vec3(-tableWidth/2 - boundaryThickness/2, boundaryHeight/2, 0), 
  new CANNON.Vec3(boundaryThickness, boundaryHeight, tableLength)
);

// Right boundary
createBoundary(
  new CANNON.Vec3(tableWidth/2 + boundaryThickness/2, boundaryHeight/2, 0), 
  new CANNON.Vec3(boundaryThickness, boundaryHeight, tableLength)
);

// Far boundary
createBoundary(
  new CANNON.Vec3(0, boundaryHeight/2, tableLength/2 + boundaryThickness/2), 
  new CANNON.Vec3(tableWidth, boundaryHeight, boundaryThickness)
);

// Near boundary
createBoundary(
  new CANNON.Vec3(0, boundaryHeight/2, -tableLength/2 - boundaryThickness/2), 
  new CANNON.Vec3(tableWidth, boundaryHeight, boundaryThickness)
);

// Cups
const cupRadius = 0.2;
const cupHeight = 0.5;
const cups = [];
const cupPositions = [
  [0, 0, 2],           // Center cup
  [0.3, 0, 1.8],       // Right cup
  [-0.3, 0, 1.8],      // Left cup
  [0.6, 0, 1.6],       // Far right cup 
  [-0.6, 0, 1.6],      // Far left cup
  [0.15, 0, 1.6],      // Right-center cup
  [-0.15, 0, 1.6]      // Left-center cup
];

cupPositions.forEach((pos) => {
  const cupGeometry = new THREE.CylinderGeometry(cupRadius, cupRadius, cupHeight, 32);
  const cupMaterial = new THREE.MeshBasicMaterial({ color: 0xff0000 });
  const cupMesh = new THREE.Mesh(cupGeometry, cupMaterial);
  cupMesh.position.set(pos[0], cupHeight / 2, pos[2]);
  scene.add(cupMesh);

  const cupBody = new CANNON.Body({ mass: 0 });
  cupBody.addShape(new CANNON.Cylinder(cupRadius, cupRadius, cupHeight, 16));
  cupBody.position.set(pos[0], cupHeight / 2, pos[2]);
  world.addBody(cupBody);

  cups.push({ mesh: cupMesh, body: cupBody, position: pos });
});

// Ball
const ballRadius = 0.05;
const ballGeometry = new THREE.SphereGeometry(ballRadius, 32, 32);
const ballMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff });
const ballMesh = new THREE.Mesh(ballGeometry, ballMaterial);
scene.add(ballMesh);

const ballBody = new CANNON.Body({ 
  mass: 0.05, // Lighter ball for better physics
  linearDamping: 0.3, // Add damping to slow ball over time
  angularDamping: 0.3 // Slow rotation
});
ballBody.addShape(new CANNON.Sphere(ballRadius));
ballBody.position.set(0, 1, -3); // Starting position
world.addBody(ballBody);
ballBody.material = new CANNON.Material();
ballBody.material.restitution = 0.7; // More bounce

// Contact material for realistic bouncing
const tableContactMaterial = new CANNON.ContactMaterial(
  ballBody.material, 
  tableBody.material, 
  { 
    restitution: 0.7, // Higher restitution for more bounce
    friction: 0.3     // Lower friction so ball rolls further
  }
);
world.addContactMaterial(tableContactMaterial);

// Socket.io connection
const socket = io();
const connectionStatus = document.getElementById('connectionStatus');
const roomIdElement = document.getElementById('roomId');
const controllerLinkElement = document.getElementById('controllerLink');
const qrCodeContainer = document.getElementById('qrCodeContainer');

// UI elements
document.getElementById('closeInfo').addEventListener('click', function() {
  document.getElementById('gameInfo').classList.add('hidden');
});

// Visual feedback elements
const throwFeedback = document.createElement('div');
throwFeedback.style.position = 'absolute';
throwFeedback.style.top = '50px';
throwFeedback.style.left = '10px';
throwFeedback.style.color = 'white';
throwFeedback.style.fontSize = '16px';
throwFeedback.style.fontFamily = 'Arial, sans-serif';
throwFeedback.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
throwFeedback.style.padding = '5px';
throwFeedback.style.borderRadius = '5px';
document.body.appendChild(throwFeedback);

// Ball state tracker
let ballInFlight = false;
let lastThrowTime = 0;
const resetDelay = 5000; // 5 seconds

// Reset ball if it goes out of bounds or stops moving
function checkBallReset() {
  const pos = ballBody.position;
  const vel = ballBody.velocity;
  const speed = Math.sqrt(vel.x * vel.x + vel.y * vel.y + vel.z * vel.z);
  
  // Display current ball info for debugging
  if (ballInFlight) {
    throwFeedback.textContent = `Ball: pos(${pos.x.toFixed(1)}, ${pos.y.toFixed(1)}, ${pos.z.toFixed(1)}) speed: ${speed.toFixed(1)}`;
  }
  
  // Reset if out of bounds or if it's been moving too long with little speed
  if (pos.y < -5 || pos.x < -10 || pos.x > 10 || pos.z < -10 || pos.z > 10 || 
      (Date.now() - lastThrowTime > resetDelay && speed < 0.5 && ballInFlight)) {
    resetBall();
  }
}

// Function to reset the ball
function resetBall() {
  ballInFlight = false;
  ballBody.position.set(0, 1, -3); // Reset position
  ballBody.velocity.set(0, 0, 0);  // Stop movement
  ballBody.angularVelocity.set(0, 0, 0); // Stop rotation
  throwFeedback.textContent = 'Ready for next throw';
}

// Collision detection
let lastHitTime = 0;
ballBody.addEventListener('collide', (event) => {
  const otherBody = event.body;
  
  // Prevent multiple detections within short time
  if (Date.now() - lastHitTime < 500) return;
  
  const hitCup = cups.find(cup => cup.body === otherBody);
  if (hitCup) {
    lastHitTime = Date.now();
    scene.remove(hitCup.mesh);
    world.removeBody(hitCup.body);
    cups.splice(cups.indexOf(hitCup), 1);
    throwFeedback.textContent = 'Cup hit! 🎉';
    console.log('Cup hit!');
    
    // Reset the ball after a cup hit
    setTimeout(() => {
      resetBall();
    }, 2000);
  }
});

// Socket.io event handlers
socket.on('connect', () => {
  console.log('Connected to server, joining room:', roomId);
  connectionStatus.textContent = 'Connected';
  connectionStatus.classList.remove('disconnected');
  connectionStatus.classList.add('connected');
  
  // Join the specific room
  socket.emit('joinRoom', roomId);
});

socket.on('disconnect', () => {
  console.log('Disconnected from server');
  connectionStatus.textContent = 'Disconnected';
  connectionStatus.classList.remove('connected');
  connectionStatus.classList.add('disconnected');
});

socket.on('roomJoined', (data) => {
  console.log('Joined room:', data.roomId);
  roomIdElement.textContent = data.roomId;
  
  // Generate controller URL
  const domain = 'pong.futurepr0n.com'; // Use the specified domain
  const controllerUrl = `https://${domain}/controller.html?room=${data.roomId}`;
  
  // Display controller link
  controllerLinkElement.textContent = controllerUrl;
  
  // Generate QR Code
  if (qrCodeContainer) {
    qrCodeContainer.innerHTML = '';
    new QRCode(qrCodeContainer, {
      text: controllerUrl,
      width: 128,
      height: 128,
      colorDark: "#000000",
      colorLight: "#ffffff",
      correctLevel: QRCode.CorrectLevel.H
    });
  }
});

socket.on('roomError', (data) => {
  console.error('Room error:', data.message);
  alert(`Error: ${data.message}. Redirecting to home page...`);
  window.location.href = '/';
});

// Handle throw event
socket.on('throw', (velocityDevice) => {
  console.log('Received throw:', velocityDevice);
  
  // Use a dynamic scale factor based on the velocity magnitude
  const velocityMagnitude = Math.sqrt(
    velocityDevice.x * velocityDevice.x + 
    velocityDevice.y * velocityDevice.y + 
    velocityDevice.z * velocityDevice.z
  );
  
  // Adjust scale factor based on magnitude - lower for strong throws
  let scaleFactor = 1.2;
  if (velocityMagnitude > 20) {
    scaleFactor = 0.9; // Less amplification for stronger throws
  } else if (velocityMagnitude < 10) {
    scaleFactor = 1.5; // More amplification for weaker throws
  }
  
  // Apply the velocity with the dynamic scale factor
  const vGame = new CANNON.Vec3(
    velocityDevice.x * scaleFactor,
    velocityDevice.y * scaleFactor,
    velocityDevice.z * scaleFactor
  );
  
  // Reset and position the ball for the new throw
  resetBall();
  
  // Apply velocity after a short delay (for visual effect)
  setTimeout(() => {
    // Apply velocity to ball
    ballBody.velocity.set(vGame.x, vGame.y, vGame.z);
    
    // Add slight random spin for realism
    ballBody.angularVelocity.set(
      (Math.random() - 0.5) * 5,
      (Math.random() - 0.5) * 5,
      (Math.random() - 0.5) * 5
    );
    
    // Visual feedback
    throwFeedback.textContent = `Throw power: ${Math.round(velocityMagnitude)}`;
    
    // Update ball state
    ballInFlight = true;
    lastThrowTime = Date.now();
    
    console.log('Applied velocity:', vGame);
  }, 200);
});

// Animation loop
function animate() {
  requestAnimationFrame(animate);
  
  // Step the physics simulation
  world.step(1/60);

  // Sync ball mesh with physics body
  ballMesh.position.copy(ballBody.position);
  ballMesh.quaternion.copy(ballBody.quaternion);
  
  // Check if ball needs reset
  checkBallReset();

  renderer.render(scene, camera);
}

// Start the animation
animate();

// Handle window resize
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});