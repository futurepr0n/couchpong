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

// Physics setup - Ensure strong gravity with weighted feel
const world = new CANNON.World();
world.gravity.set(0, -12, 0); // Slightly reduced gravity for more weighted feel
world.defaultContactMaterial.friction = 0.6; // Increased friction
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
const cupThickness = 0.02; // Wall thickness for hollow cups
const cupSpacing = 0.45; // Spacing between cup centers
const cups = [];
const cupPositions = [
  // Row 1 (farthest from player, base of triangle)
  [-cupSpacing*3, 0, 2 + cupSpacing*3],
  [-cupSpacing, 0, 2 + cupSpacing*3],
  [cupSpacing, 0, 2 + cupSpacing*3],
  [cupSpacing*3, 0, 2 + cupSpacing*3],
  
  // Row 3 
  [-cupSpacing*2, 0, 2 + cupSpacing*2],
  [0, 0, 2 + cupSpacing*2],
  [cupSpacing*2, 0, 2 + cupSpacing*2],
  
  // Row 2
  [-cupSpacing, 0, 2 + cupSpacing],
  [cupSpacing, 0, 2 + cupSpacing],
  
  // Row 1 (closest to player, tip of triangle)
  [0, 0, 2]
];


cupPositions.forEach((pos) => {
  // Create a visual representation of the cup (cylinder with hole)
  const cupOuterGeometry = new THREE.CylinderGeometry(cupRadius, cupRadius * 0.85, cupHeight, 32);
  const cupInnerGeometry = new THREE.CylinderGeometry(cupRadius - cupThickness, (cupRadius - cupThickness) * 0.85, cupHeight, 32);
  
  // Offset the inner cylinder slightly so it doesn't create z-fighting
  cupInnerGeometry.translate(0, 0.01, 0);
  
  // Use Three.js CSG to create a hollow cup (if available)
  // If CSG is not available, we'll use a visual trick
  const cupMaterial = new THREE.MeshBasicMaterial({ color: 0xff0000 });
  const cupMesh = new THREE.Mesh(cupOuterGeometry, cupMaterial);
  
  // Make the top face of the cup invisible to simulate a hollow cup
  cupMesh.position.set(pos[0], cupHeight / 2, pos[2]);
  scene.add(cupMesh);
  
  // Create an invisible cylinder for the inside of the cup to detect when ball goes in
  const innerMaterial = new THREE.MeshBasicMaterial({ 
    color: 0xff0000, 
    transparent: true, 
    opacity: 0.0,
    side: THREE.BackSide // Render inside faces
  });
  const innerMesh = new THREE.Mesh(cupInnerGeometry, innerMaterial);
  innerMesh.position.set(pos[0], cupHeight / 2, pos[2]);
  scene.add(innerMesh);
  
  // Cup physics - use cylinder with hole for proper physics
  // Create outer wall cylinder shape
  const cupBody = new CANNON.Body({ mass: 0 });
  
  // Create a cylinder body with small thickness for the cup wall
  const outerShape = new CANNON.Cylinder(cupRadius, cupRadius * 0.85, cupHeight, 16);
  const innerShape = new CANNON.Cylinder(cupRadius - cupThickness, (cupRadius - cupThickness) * 0.85, cupHeight - cupThickness, 16);
  
  // Position and add the cup body
  cupBody.position.set(pos[0], cupHeight / 2, pos[2]);
  cupBody.addShape(outerShape);
  world.addBody(cupBody);
  
  // Create a trigger body for detecting when the ball goes inside the cup
  const triggerBody = new CANNON.Body({ 
    mass: 0,
    collisionResponse: false, // This makes it a trigger (no physical interaction, just detection)
    isTrigger: true
  });
  triggerBody.addShape(innerShape);
  triggerBody.position.set(pos[0], cupHeight / 2, pos[2]);
  world.addBody(triggerBody);
  
  // Add to our cups array
  cups.push({
    mesh: cupMesh,
    innerMesh: innerMesh,
    body: cupBody,
    triggerBody: triggerBody,
    position: pos,
    isHit: false
  });
});

// Ball
const ballRadius = 0.05;
const ballGeometry = new THREE.SphereGeometry(ballRadius, 32, 32);
const ballMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff });
const ballMesh = new THREE.Mesh(ballGeometry, ballMaterial);
scene.add(ballMesh);

const ballBody = new CANNON.Body({ 
  mass: 0.08, // Slightly heavier ball for more weighted feel
  linearDamping: 0.4, // Increased damping to slow ball more quickly
  angularDamping: 0.5 // Increased rotational damping
});
ballBody.addShape(new CANNON.Sphere(ballRadius));
ballBody.position.set(0, 1, -3); // Starting position
world.addBody(ballBody);
ballBody.material = new CANNON.Material();
ballBody.material.restitution = 0.7; // More bounce

// Contact material for realistic bouncing with weighted feel
const tableContactMaterial = new CANNON.ContactMaterial(
  ballBody.material, 
  tableBody.material, 
  { 
    restitution: 0.6, // Slightly lower restitution for less bounce
    friction: 0.4     // Higher friction for more controlled rolling
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
  cupHitInCurrentTurn = false;  // Reset the cup hit flag
  ballBody.position.set(0, 1, -3); // Reset position
  ballBody.velocity.set(0, 0, 0);  // Stop movement
  ballBody.angularVelocity.set(0, 0, 0); // Stop rotation
  throwFeedback.textContent = 'Ready for next throw';
}

// Collision detection
let cupHitInCurrentTurn = false;
let lastHitTime = 0;

function checkBallInCup() {
  if (cupHitInCurrentTurn) return; // Only check if we haven't hit a cup already

  const ballPos = ballBody.position;
  
  for (let i = 0; i < cups.length; i++) {
    const cup = cups[i];
    if (cup.isHit) continue; // Skip already hit cups
    
    const cupPos = cup.position;
    
    // Check if the ball's center is within the cup's inner radius and below the cup's rim
    const dx = ballPos.x - cupPos[0];
    const dz = ballPos.z - cupPos[2];
    const horizontalDist = Math.sqrt(dx * dx + dz * dz);
    
    // Check if ball is inside cup radius and below the cup top but above the cup bottom
    if (horizontalDist < (cupRadius - cupThickness) * 0.85 && 
        ballPos.y < cupHeight && 
        ballPos.y > 0.05) {
        
      // Ball is in the cup!
      cupHitInCurrentTurn = true;
      cup.isHit = true;
      
      // Visual feedback
      throwFeedback.textContent = 'Cup hit! 🎉';
      
      // Create a hit effect (expanding circle)
      const hitEffect = new THREE.Mesh(
        new THREE.RingGeometry(0.1, 0.12, 32),
        new THREE.MeshBasicMaterial({ color: 0xffff00, transparent: true, opacity: 0.8 })
      );
      hitEffect.position.set(cupPos[0], 0.01, cupPos[2]);
      hitEffect.rotation.x = -Math.PI / 2; // Flat on the table
      scene.add(hitEffect);
      
      // Animate the hit effect
      const expandEffect = () => {
        hitEffect.scale.x += 0.1;
        hitEffect.scale.y += 0.1;
        hitEffect.material.opacity -= 0.05;
        
        if (hitEffect.material.opacity > 0) {
          requestAnimationFrame(expandEffect);
        } else {
          scene.remove(hitEffect);
        }
      };
      requestAnimationFrame(expandEffect);
      
      // Stop the ball's movement
      ballBody.velocity.set(0, 0, 0);
      ballBody.angularVelocity.set(0, 0, 0);
      
      // Remove the cup after a short delay
      setTimeout(() => {
        scene.remove(cup.mesh);
        scene.remove(cup.innerMesh);
        world.removeBody(cup.body);
        world.removeBody(cup.triggerBody);
        
        // Reset the ball after a short delay
        setTimeout(() => {
          resetBall();
          cupHitInCurrentTurn = false;
        }, 1000);
      }, 500);
      
      return; // Exit the loop since we've found a hit
    }
  }
}



/* ballBody.addEventListener('collide', (event) => {
  const otherBody = event.body;
  
  // Prevent multiple detections within short time and only allow one cup hit per turn
  if (Date.now() - lastHitTime < 500 || cupHitInCurrentTurn) return;
  
  const hitCup = cups.find(cup => cup.body === otherBody);
  if (hitCup) {
    lastHitTime = Date.now();
    cupHitInCurrentTurn = true;  // Mark that we've hit a cup this turn
    
    // Stop the ball immediately to prevent further collisions
    ballBody.velocity.set(0, 0, 0);
    ballBody.angularVelocity.set(0, 0, 0);
    
    // Visual feedback
    throwFeedback.textContent = 'Cup hit! 🎉';
    console.log('Cup hit!');
    
    // Create a hit effect (expanding circle)
    const hitEffect = new THREE.Mesh(
      new THREE.RingGeometry(0.1, 0.12, 32),
      new THREE.MeshBasicMaterial({ color: 0xffff00, transparent: true, opacity: 0.8 })
    );
    hitEffect.position.set(hitCup.position[0], 0.01, hitCup.position[2]);
    hitEffect.rotation.x = -Math.PI / 2; // Flat on the table
    scene.add(hitEffect);
    
    // Animate the hit effect
    const expandEffect = () => {
      hitEffect.scale.x += 0.1;
      hitEffect.scale.y += 0.1;
      hitEffect.material.opacity -= 0.05;
      
      if (hitEffect.material.opacity > 0) {
        requestAnimationFrame(expandEffect);
      } else {
        scene.remove(hitEffect);
      }
    };
    requestAnimationFrame(expandEffect);
    
    // Remove the cup
    scene.remove(hitCup.mesh);
    world.removeBody(hitCup.body);
    cups.splice(cups.indexOf(hitCup), 1);
    
    // Reset the ball after a short delay
    setTimeout(() => {
      resetBall();
      cupHitInCurrentTurn = false;  // Reset the cup hit flag for the next turn
    }, 1500);
  }
}); */

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
  
  // Only allow a new throw if we haven't hit a cup in the current turn
  if (cupHitInCurrentTurn) {
    throwFeedback.textContent = 'Cup already hit! Wait for reset...';
    return;
  }
  
  // Use a dynamic scale factor based on the velocity magnitude
  const velocityMagnitude = Math.sqrt(
    velocityDevice.x * velocityDevice.x + 
    velocityDevice.y * velocityDevice.y + 
    velocityDevice.z * velocityDevice.z
  );
  
  // Reduced power by ~50% to make throws more weighted and controlled
  let scaleFactor = 0.6;  // Reduced from 1.2
  if (velocityMagnitude > 20) {
    scaleFactor = 0.45;  // Reduced from 0.9
  } else if (velocityMagnitude < 10) {
    scaleFactor = 0.75;  // Reduced from 1.5
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

  // Check if ball is inside a cup
  checkBallInCup();

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