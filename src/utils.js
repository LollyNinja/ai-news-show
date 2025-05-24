// Utility functions

// Estimate loading time based on line count and connection speed
export function estimateLoadingTime(lineCount, topic) {
    // Base time for dialogue generation (seconds)
    const baseGenerationTime = 3;
    
    // Estimated time per line for TTS generation (seconds)
    const timePerLine = 1.5;
    
    // Add complexity factor based on topic length
    const topicComplexityFactor = Math.min(1 + (topic.length / 100), 1.5);
    
    // Calculate total estimated time in seconds
    const generationTime = baseGenerationTime * topicComplexityFactor;
    const audioLoadingTime = lineCount * timePerLine;
    
    // Total time with 20% buffer
    return Math.ceil((generationTime + audioLoadingTime) * 1.2);
}

// Update countdown based on actual loading progress
export function updateCountdownBasedOnProgress(loaded, total, loadingStartTime, countdownInterval, updateCountdownTimer, preparingLabel) {
    if (loaded === 0 || total === 0) return;
    
    // Calculate elapsed time
    const elapsedSeconds = Math.floor((Date.now() - loadingStartTime) / 1000);
    
    // Calculate estimated time remaining based on progress
    const progress = loaded / total;
    const estimatedTotalTime = elapsedSeconds / progress;
    const remainingTime = Math.ceil(estimatedTotalTime - elapsedSeconds);
    
    // Only update if we're not close to done and the new estimate is valid
    if (progress < 0.9 && remainingTime > 0 && !isNaN(remainingTime)) {
        // Update countdown with more accurate time
        clearInterval(countdownInterval);
        updateCountdownTimer(remainingTime);
        
        // Restart interval with new value
        let currentRemaining = remainingTime;
        countdownInterval = setInterval(() => {
            currentRemaining--;
            if (currentRemaining <= 0) {
                clearInterval(countdownInterval);
                currentRemaining = 0;
            }
            updateCountdownTimer(currentRemaining);
        }, 1000);
        
        // Update preparing label
        preparingLabel.textContent = `Loading voice audio: ${loaded}/${total} lines (${Math.round(progress * 100)}%)`;
    }
}