// What happens in each chapter: which part of the simulated dive it shows,
// where the camera looks and which explanations are on screen.
// Camera: az (degrees, 180 = diver's left side, 90 = in front), el (degrees), dist (m), target offset in diver space.

export function buildChapters(marks) {
  return [
    {
      id: 'intro', t: [0, 2],
      cam: { az: 140, el: -22, dist: 5.2, target: [0.05, 0.1, 0] },
      show: {},
    },
    {
      id: 'surface', t: [2, marks.vent],
      cam: { az: 150, el: -14, dist: 4.6, target: [0.1, 0.05, 0] },
      show: { forces: true, arrow: true },
    },
    {
      id: 'start', t: [marks.vent, marks.d2],
      cam: { az: 182, el: -3, dist: 4.4, target: [0.05, 0.05, 0] },
      show: { forces: true, arrow: true, labels: ['bcd'] },
    },
    {
      id: 'accelerate', t: [marks.d2, marks.d10],
      cam: { az: 196, el: 7, dist: 4.6, target: [0.05, 0.05, 0] },
      show: { forces: true, arrow: true, labels: ['bcd'] },
    },
    {
      id: 'pressure', t: [marks.d10, marks.d20],
      cam: { az: 158, el: 14, dist: 5.6, target: [-0.05, 0.05, 0] },
      show: { pressure: true },
    },
    {
      id: 'boyle', t: [marks.d20, marks.d30],
      cam: { az: 205, el: 10, dist: 4.6, target: [0.0, 0.32, -0.1] },
      show: { balloon: true, balloonPanel: true, labels: ['balloon', 'bcd'] },
    },
    {
      id: 'body', t: [marks.d30, marks.ascent],
      cam: { az: 194, el: -12, dist: 1.9, target: [0.4, 0.03, 0] },
      show: { xray: 1, ear: true, balloon: true, labels: ['lungs', 'sinus', 'ear', 'mask', 'bcd'] },
    },
    {
      id: 'ascent', t: [marks.ascent, marks.stop],
      cam: { az: 200, el: -6, dist: 3.5, target: [0.25, 0.2, -0.08] },
      show: { xray: 0.7, ghost: true, warn: true, balloon: true, balloonPanel: true, kick: true, labels: ['lungs', 'balloon'] },
    },
    {
      id: 'end', t: [marks.stop, marks.end],
      cam: { az: 138, el: -20, dist: 5.4, target: [0.05, 0.1, 0] },
      show: { balloon: true, kick: true },
    },
  ];
}
