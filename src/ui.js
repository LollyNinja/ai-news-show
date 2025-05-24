// Broadcast UI-specific functions

import { elements } from '../ui.js';
import { 
    updateProgressBar, updateStatus, updateSubtitle, 
    toggleLoading, toggleBreakingNews, toggleProgressContainer,
    setStartButtonText, toggleQueueButton, toggleQueueInfo,
    updateQueuedTopics, updateQueueStatus, disableQueueButton,
    renderQueueList
} from '../ui.js';

// Update the broadcast UI based on state
export function updateBroadcastUI(state) {
    const { isPlaying, topic, progress, message, isGenerating, isLoading } = state;
    
    // Update UI based on state
    if (isPlaying) {
        setStartButtonText('Stop Broadcast');
    } else {
        setStartButtonText('Start Broadcast');
    }
    
    if (progress !== undefined) {
        updateProgressBar(progress);
    }
    
    if (message) {
        updateStatus(message);
    }
    
    if (topic) {
        toggleBreakingNews(true, topic);
    }
    
    if (isGenerating !== undefined) {
        toggleLoading(isGenerating);
    }
    
    if (isLoading !== undefined) {
        toggleProgressContainer(isLoading);
    }
}

// Reset the broadcast UI to initial state
export function resetBroadcastUI() {
    setStartButtonText('Start Broadcast');
    updateSubtitle('Welcome to AI News Network');
    toggleBreakingNews(false);
    toggleLoading(false);
    toggleProgressContainer(false);
    updateStatus('Enter a topic and click \'Start Broadcast\'');
    
    // Reset anchors
    elements.anchor1.classList.remove('active');
    elements.anchor2.classList.remove('active');
    
    // Hide queue button
    toggleQueueButton(false);
    
    // Ensure overlays are hidden
    elements.introOverlay.classList.remove('active');
    elements.introOverlay.classList.remove('fade-out');
    elements.outroOverlay.classList.remove('active');
    elements.outroOverlay.classList.remove('fade-out');
}