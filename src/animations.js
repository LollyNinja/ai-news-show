// Animation related code

import { elements } from './ui.js';
import { newsJingle, outroJingle } from './audio.js';

// Start talking animation for the currently active anchor
export function startTalkingAnimation(anchor) {
    // First stop any existing animation
    stopTalkingAnimation();
    
    // Add talking class to the active anchor
    anchor.classList.add('talking');
}

// Stop talking animation
export function stopTalkingAnimation(specificAnchor = null) {
    if (specificAnchor) {
        specificAnchor.classList.remove('talking');
    } else {
        // Stop all talking animations
        elements.anchor1.classList.remove('talking');
        elements.anchor2.classList.remove('talking');
        
        // Also check for feed anchors
        const feedAnchor1 = document.getElementById('feed-anchor1');
        const feedAnchor2 = document.getElementById('feed-anchor2');
        if (feedAnchor1) feedAnchor1.classList.remove('talking');
        if (feedAnchor2) feedAnchor2.classList.remove('talking');
    }
}

// Play intro animation with news jingle
export async function playIntroAnimation() {
    return new Promise((resolve) => {
        // Reset and make intro overlay visible
        elements.introOverlay.classList.remove('fade-out');
        elements.introOverlay.classList.add('active');
        
        // Start the news jingle
        newsJingle.currentTime = 0;
        newsJingle.play();
        
        // Set a timeout for the fade-out effect and resolution
        // This should match the duration of the jingle (around 5-7 seconds)
        setTimeout(() => {
            elements.introOverlay.classList.add('fade-out');
            
            // Wait for fade-out to complete before resolving
            setTimeout(() => {
                elements.introOverlay.classList.remove('active');
                resolve();
            }, 1000); // Fade out duration
            
        }, 4500); // Intro duration before fade-out (adjusted to jingle length)
    });
}

// Show on-air countdown overlay
export function showOnAirCountdown() {
    elements.onAirOverlay.classList.add('active');
}

// Hide on-air countdown overlay
export function hideOnAirCountdown() {
    elements.onAirOverlay.classList.remove('active');
}

// Update the countdown timer display
export function updateCountdownTimer(seconds) {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    elements.countdownTimer.textContent = `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
}

// Play outro animation with outro jingle
export async function playOutroAnimation() {
    return new Promise((resolve) => {
        // Reset and make outro overlay visible
        elements.outroOverlay.classList.remove('fade-out');
        elements.outroOverlay.classList.add('active');
        
        // Start the outro jingle
        outroJingle.currentTime = 0;
        outroJingle.play();
        
        // Set a timeout for the fade-out effect and resolution
        setTimeout(() => {
            elements.outroOverlay.classList.add('fade-out');
            
            // Wait for fade-out to complete before resolving
            setTimeout(() => {
                elements.outroOverlay.classList.remove('active');
                resolve();
            }, 1000); // Fade out duration
            
        }, 4500); // Outro duration before fade-out
    });
}