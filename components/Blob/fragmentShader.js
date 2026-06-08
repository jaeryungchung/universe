const fragmentShader = `
uniform float u_intensity;
uniform float u_time;

varying vec2 vUv;
varying float vDisplacement;
varying vec3 vNormal;
varying vec3 vPosition;

void main() {
    float distort = 0.75 * vDisplacement * u_intensity * sin(vUv.y * 6.0 + u_time);
    vec3 normal = normalize(vNormal);
    vec3 viewDirection = normalize(cameraPosition - vPosition);
    float fresnel = pow(1.0 - max(dot(normal, viewDirection), 0.0), 3.0);
    float innerGlow = smoothstep(-0.5, 0.45, vDisplacement);

    vec3 milkyWhite = vec3(0.985, 0.975, 0.965);
    vec3 warmTint = vec3(0.975, 0.94, 0.86);
    vec3 color = mix(milkyWhite, warmTint, 0.05 + 0.03 * sin(u_time + vUv.x * 2.0));
    color = mix(color * 0.8, vec3(1.0), fresnel * 0.35);
    color += vec3(0.045, 0.04, 0.02) * innerGlow * (1.0 - distort * 0.18);

    float alpha = 0.28 + fresnel * 0.08 + innerGlow * 0.06;
    gl_FragColor = vec4(color, alpha);
}

`;

export default fragmentShader;
