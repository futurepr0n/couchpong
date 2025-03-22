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

// Physics setup
const world = new CANNON.World();
world.gravity.set(0, -9.82, 0);

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
tableBody.material.restitution = 0.5;

// Cups
const cupRadius = 0.2;
const cupHeight = 0.5;
const cups = [];
const cupPositions = [
  [0, 0, 2], [0.3, 0, 1.8], [-0.3, 0, 1.8] // Simplified triangle formation
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

const ballBody = new CANNON.Body({ mass: 1 });
ballBody.addShape(new CANNON.Sphere(ballRadius));
world.addBody(ballBody);
ballBody.material = new CANNON.Material();
ballBody.material.restitution = 0.8;

// Contact material for realistic bouncing
const contactMaterial = new CANNON.ContactMaterial(ballBody.material, tableBody.material, { restitution: 0.7 });
world.addContactMaterial(contactMaterial);

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
throwFeedback.style.top = '10px';
throwFeedback.style.left = '10px';
throwFeedback.style.color = 'white';
throwFeedback.style.fontSize = '16px';
throwFeedback.style.fontFamily = 'Arial, sans-serif';
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
  
  // Reset if out of bounds or if it's been moving too long
  if (pos.y < -5 || pos.x < -10 || pos.x > 10 || pos.z < -10 || pos.z > 10 || 
      (Date.now() - lastThrowTime > resetDelay && speed < 0.5 && ballInFlight)) {
    ballInFlight = false;
    ballBody.position.set(0, 1, -3); // Reset position
    ballBody.velocity.set(0, 0, 0);  // Stop movement
    throwFeedback.textContent = '';  // Clear feedback
  }
}

// Collision detection
ballBody.addEventListener('collide', (event) => {
  const otherBody = event.body;
  const hitCup = cups.find(cup => cup.body === otherBody);
  if (hitCup) {
    scene.remove(hitCup.mesh);
    world.removeBody(hitCup.body);
    cups.splice(cups.indexOf(hitCup), 1);
    throwFeedback.textContent = 'Cup hit! 🎉';
    console.log('Cup hit!');
    
    // Reset the ball after a cup hit
    setTimeout(() => {
      ballInFlight = false;
      ballBody.position.set(0, 1, -3);
      ballBody.velocity.set(0, 0, 0);
      throwFeedback.textContent = '';
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
  // Use a dynamic scale factor based on the velocity magnitude
  const velocityMagnitude = Math.sqrt(
    velocityDevice.x * velocityDevice.x + 
    velocityDevice.y * velocityDevice.y + 
    velocityDevice.z * velocityDevice.z
  );
  
  // Adjust scale factor based on magnitude - lower for strong throws
  let scaleFactor = 1.5;
  if (velocityMagnitude > 20) {
    scaleFactor = 1.2; // Less amplification for stronger throws
  } else if (velocityMagnitude < 10) {
    scaleFactor = 1.8; // More amplification for weaker throws
  }
  
  // Apply the velocity with the dynamic scale factor
  const vGame = new CANNON.Vec3(
    velocityDevice.x * scaleFactor,
    velocityDevice.y * scaleFactor,
    velocityDevice.z * scaleFactor
  );
  
  // Set ball position and apply velocity
  ballBody.position.set(0, 1, -3);
  ballBody.velocity.set(vGame.x, vGame.y, vGame.z);
  
  // Visual feedback
  throwFeedback.textContent = `Throw power: ${Math.round(velocityMagnitude)}`;
  
  // Update ball state
  ballInFlight = true;
  lastThrowTime = Date.now();
  
  console.log('Applied velocity:', vGame);
});

// Animation loop
function animate() {
  requestAnimationFrame(animate);
  world.step(1 / 60); // Physics step

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