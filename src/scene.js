
import * as THREE from 'three';

export let scene, camera, renderer, up, floor, directionalLight;

export function initScene() {
    scene = new THREE.Scene();

    const frustumSize = 18;
    const aspect = window.innerWidth / window.innerHeight;
    let leftBound = -frustumSize * aspect / 2;
    let rightBound = frustumSize * aspect / 2;
    let topBound = frustumSize / 2;
    let bottomBound = -frustumSize / 2;
    up = new THREE.Vector3(0, 1, 0);

    camera = new THREE.OrthographicCamera(leftBound, rightBound, topBound, bottomBound, 1, 100);
    camera.position.set(0, 30, 0);
    camera.up.set(0, 0, -1);
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();

    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    const sceneContainer = document.getElementById('scene-container');
    sceneContainer.appendChild(renderer.domElement);
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
    scene.add(ambientLight);
    directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(5, 10, 7.5);
    directionalLight.castShadow = true;
    directionalLight.shadow.mapSize.width = 2048;
    directionalLight.shadow.mapSize.height = 2048;
    directionalLight.shadow.bias = -0.0001; // Prevents shadow acne

    // Set up the shadow camera to match the main camera's initial view
    directionalLight.shadow.camera.left = leftBound;
    directionalLight.shadow.camera.right = rightBound;
    directionalLight.shadow.camera.top = topBound;
    directionalLight.shadow.camera.bottom = bottomBound;
    directionalLight.shadow.camera.near = 0.5;
    directionalLight.shadow.camera.far = 100;
    scene.add(directionalLight);

    // Floor
    const floorGeometry = new THREE.PlaneGeometry(50, 50, 1, 1);
    const floorMaterial = new THREE.ShadowMaterial({ opacity: 0.5 });
    floor = new THREE.Mesh(floorGeometry, floorMaterial);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.05;
    floor.receiveShadow = true;
    scene.add(floor);
}
