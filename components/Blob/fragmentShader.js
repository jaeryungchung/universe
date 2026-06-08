const fragmentShader = `
uniform float u_intensity;
uniform float u_time;

varying vec2 vUv;
varying float vDisplacement;
varying vec3 vNormal;
varying vec3 vPosition;

void main() {
    float distort = 1.15 * vDisplacement * u_intensity * sin(vUv.y * 8.0 + u_time);
    vec3 normal = normalize(vNormal);
    vec3 viewDirection = normalize(cameraPosition - vPosition);
    float fresnel = pow(1.0 - max(dot(normal, viewDirection), 0.0), 3.0);
    float innerGlow = smoothstep(-0.55, 0.55, vDisplacement);

    vec3 milkyWhite = vec3(0.98, 0.975, 0.965);
    vec3 coolTint = vec3(0.93, 0.95, 1.0);
    vec3 color = mix(milkyWhite, coolTint, 0.08 + 0.06 * sin(u_time + vUv.x * 2.5));
    color = mix(color * 0.78, vec3(1.0), fresnel * 0.5);
    color += vec3(0.05, 0.045, 0.03) * innerGlow * (1.0 - distort * 0.2);

    float alpha = 0.22 + fresnel * 0.18 + innerGlow * 0.1;
    gl_FragColor = vec4(color, alpha);
}

`;

export default fragmentShader;
