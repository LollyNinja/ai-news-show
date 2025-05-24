// Settings management

import { elements } from './ui.js';

// Toggle settings panel visibility
export function toggleSettings() {
    elements.settingsPanel.classList.toggle('active');
    elements.settingsToggle.textContent = elements.settingsPanel.classList.contains('active') 
        ? 'Hide Settings' 
        : 'Show Settings';
}

// Update lines value display when slider is moved
export function updateLinesValue() {
    elements.linesValue.textContent = elements.linesPerAnchorSlider.value;
}