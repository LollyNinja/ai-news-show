// Broadcast actions (share, delete, play)

import { feedElements, updatePlayingState, showFeedStudio, hideFeedStudio } from './ui.js';
import { updateBroadcastVisibility, deleteBroadcast, getCurrentUser } from '../database.js';
import { refreshFeed } from './index.js';
import { playAnimationWithOverlay, startPlayback, stopPlayback } from './playback.js';
import { clearAudioQueue } from '../audio.js';
import { sanitizeBroadcast, sanitizeDomElements } from './sanitize.js';
import { 
    initiateBroadcastHandshake,
    notifyBroadcastLive,
    notifyBroadcastEnd,
    isBroadcastHandshakeComplete
} from '../broadcast/communication.js';

// Currently playing broadcast ID
let currentlyPlayingId = null;
export const isPlayingRef = { current: false };

// Track if a broadcast is currently being loaded
let isLoadingBroadcast = false;

// Track if a broadcast load was canceled
let wasBroadcastCanceled = false;

// Lock to prevent multiple broadcasts from starting simultaneously
let broadcastLock = false;

// Handle sharing a broadcast
export async function handleShareBroadcast(broadcastId) {
    try {
        // Show confirmation dialog
        if (!confirm('Share this broadcast publicly? Others will be able to view and play it.')) {
            return;
        }
        
        // Update the broadcast visibility to public
        await updateBroadcastVisibility(broadcastId, 'public');
        
        // Show success message
        alert('Broadcast shared successfully!');
        
        // Refresh the feed to show updated status
        refreshFeed();
    } catch (error) {
        console.error('Error sharing broadcast:', error);
        alert('Failed to share broadcast: ' + error.message);
    }
}

// Handle deleting a broadcast
export async function handleDeleteBroadcast(broadcastId) {
    try {
        // Show confirmation dialog
        if (!confirm('Are you sure you want to delete this broadcast? This action cannot be undone.')) {
            return;
        }
        
        // Delete the broadcast
        await deleteBroadcast(broadcastId);
        
        // Show success message
        alert('Broadcast deleted successfully!');
        
        // Refresh the feed
        refreshFeed();
    } catch (error) {
        console.error('Error deleting broadcast:', error);
        alert('Failed to delete broadcast: ' + error.message);
    }
}

// Cancel the current broadcast loading process
export function cancelBroadcastLoading() {
    if (!isLoadingBroadcast || !currentlyPlayingId) {
        console.log("No broadcast currently loading to cancel");
        return;
    }
    
    console.log("Canceling broadcast loading");
    
    // Set the canceled flag to true
    wasBroadcastCanceled = true;
    
    // Stop playback and clear audio
    isPlayingRef.current = false;
    stopPlayback(currentlyPlayingId, isPlayingRef);
    clearAudioQueue();
    
    // Update UI to show cancellation
    updatePlayingState(currentlyPlayingId, false);
    hideFeedStudio();
    
    // Update the feed status
    feedElements.feedStatus.textContent = "Broadcast loading canceled by user";
    
    // Reset state variables
    const canceledId = currentlyPlayingId;
    currentlyPlayingId = null;
    isLoadingBroadcast = false;
    
    // Notify server about broadcast cancellation
    const cancellationStats = {
        successful: false,
        error: 'Canceled by user',
        phase: 'preparation',
        canceled: true
    };
    notifyBroadcastEnd(cancellationStats).catch(console.error);
    
    // Add a temporary cancellation indicator to the broadcast item
    const broadcastItem = document.getElementById(`feed-item-${canceledId}`);
    if (broadcastItem) {
        const cancelMsg = document.createElement('div');
        cancelMsg.className = 'feed-broadcast-cancelled';
        cancelMsg.textContent = 'Loading canceled';
        
        // Add after play button
        const playButton = broadcastItem.querySelector('.feed-item-play-button');
        if (playButton) {
            playButton.insertAdjacentElement('afterend', cancelMsg);
            
            // Remove after 3 seconds
            setTimeout(() => {
                cancelMsg.remove();
            }, 3000);
        }
    }
    
    // Immediately release the broadcast lock
    broadcastLock = false;
    
    // After a small delay, completely reset the state - CRITICAL FIX
    setTimeout(() => {
        // This additional explicit reset ensures we're ready for the next broadcast
        wasBroadcastCanceled = false; // Reset the cancellation flag
        
        // Reset all audio elements
        const allAudio = document.querySelectorAll('audio');
        allAudio.forEach(audio => {
            try {
                audio.pause();
                audio.currentTime = 0;
            } catch (e) {
                console.error("Error resetting audio:", e);
            }
        });
        
        // Restore the feed list view
        refreshFeed();
    }, 300);
}

// Handle playing a broadcast
export async function handlePlayBroadcast(broadcast) {
    try {
        // Check if broadcast lock is active - prevents overlapping broadcasts
        if (broadcastLock) {
            console.log("A broadcast operation is already in progress. Please wait or cancel it.");
            feedElements.feedStatus.textContent = "Please wait for the current operation to complete or cancel it";
            return;
        }
        
        // Prevent starting another broadcast during loading
        if (isLoadingBroadcast) {
            console.log("Already loading a broadcast, please wait or cancel it");
            feedElements.feedStatus.textContent = "Please wait for broadcast to load or click 'Cancel'";
            return;
        }
        
        // Acquire lock to prevent overlapping operations
        broadcastLock = true;
        
        // If already playing, stop
        if (currentlyPlayingId === broadcast.id) {
            closeFeedStudio();
            return;
        }
        
        // Reset the canceled flag - Ensure it's always false when starting playback
        wasBroadcastCanceled = false;
        
        // Explicitly reset all state and UI before starting a new broadcast - CRITICAL FIX
        if (currentlyPlayingId) {
            // Properly clean up any previous broadcast
            closeFeedStudio();
            
            // Small delay to ensure complete cleanup before starting new broadcast
            await new Promise(resolve => setTimeout(resolve, 300));
        }
        
        // SANITIZE THE BROADCAST - Apply full sanitization before processing
        const sanitizedBroadcast = sanitizeBroadcast(broadcast);
        
        // Ensure the broadcast has valid content after sanitization
        if (!sanitizedBroadcast.topic || 
            !sanitizedBroadcast.dialogue || 
            !Array.isArray(sanitizedBroadcast.dialogue) || 
            sanitizedBroadcast.dialogue.length === 0) {
            throw new Error('This broadcast contains inappropriate content and cannot be played.');
        }
        
        // Set loading flag
        isLoadingBroadcast = true;
        
        // Show the news studio interface first
        showFeedStudio();
        
        // Register cancel button event handler
        if (feedElements.cancelButton) {
            // Remove any existing event listeners
            feedElements.cancelButton.replaceWith(feedElements.cancelButton.cloneNode(true));
            feedElements.cancelButton = feedElements.loadingIndicator.querySelector('.feed-loading-cancel-button');
            
            // Add new event listener
            feedElements.cancelButton.addEventListener('click', cancelBroadcastLoading);
        }
        
        // Apply immediate DOM sanitization to the studio
        sanitizeDomElements(feedElements.feedStudioContainer);
        
        // Update broadcast item UI to show loading
        updatePlayingState(sanitizedBroadcast.id, true, true);
        
        // Show loading status in feed
        feedElements.feedStatus.textContent = `Initiating broadcast handshake...`;
        
        // Update loading message in studio
        if (feedElements.loadingText) {
            feedElements.loadingText.textContent = 'Initiating broadcast handshake...';
        }
        
        // Attempt server handshake
        try {
            const handshakeData = {
                topic: sanitizedBroadcast.topic,
                visibility: sanitizedBroadcast.visibility || 'public',
                id: `feed-${sanitizedBroadcast.id}`
            };
            
            const acknowledgment = await initiateBroadcastHandshake(handshakeData);
            if (!acknowledgment || !isBroadcastHandshakeComplete()) {
                throw new Error('Server did not acknowledge broadcast request');
            }
            
            feedElements.feedStatus.textContent = `Handshake successful. Loading broadcast: "${sanitizedBroadcast.topic}"`;
            
            if (feedElements.loadingText) {
                feedElements.loadingText.textContent = 'Broadcast acknowledged. Loading content...';
            }
            
        } catch (error) {
            console.error('Broadcast handshake error:', error);
            // In the feed view, continue even if handshake fails
            // This allows playback in offline mode or if server is unavailable
            
            feedElements.feedStatus.textContent = `Loading broadcast in offline mode: "${sanitizedBroadcast.topic}"`;
            
            if (feedElements.loadingText) {
                feedElements.loadingText.textContent = 'Loading broadcast in offline mode...';
            }
        }
        
        // Start new playback
        isPlayingRef.current = true;
        currentlyPlayingId = sanitizedBroadcast.id;
        
        // Preload and play the broadcast
        await startPlayback(sanitizedBroadcast.dialogue, sanitizedBroadcast.topic, isPlayingRef, feedElements, currentlyPlayingId);
        
        // Check if the broadcast was canceled during loading
        if (wasBroadcastCanceled) {
            console.log("Broadcast was canceled during loading, stopping playback process");
            isLoadingBroadcast = false;
            broadcastLock = false; // Release lock
            return;
        }
        
        // If stopped during loading, exit
        if (!isPlayingRef.current || currentlyPlayingId !== sanitizedBroadcast.id) {
            updatePlayingState(sanitizedBroadcast.id, false);
            feedElements.feedStatus.textContent = "Broadcast playback canceled";
            isLoadingBroadcast = false;
            broadcastLock = false; // Release lock
            return;
        }
        
        // Clear loading state
        isLoadingBroadcast = false;
        
        // Update feed status
        feedElements.feedStatus.textContent = `Now playing: "${sanitizedBroadcast.topic}"`;
        
        // Release the lock at the end of successful playback setup
        broadcastLock = false;
        
    } catch (error) {
        console.error('Error playing broadcast:', error);
        feedElements.feedStatus.textContent = 'Error playing broadcast: ' + error.message;
        currentlyPlayingId = null;
        isPlayingRef.current = false;
        updatePlayingState(broadcast?.id, false);
        hideFeedStudio();
        isLoadingBroadcast = false;
        
        // CRITICAL FIX: Ensure wasBroadcastCanceled is reset even after errors
        wasBroadcastCanceled = false;
        
        // Always release the lock in case of errors
        broadcastLock = false;
        
        // Notify server about broadcast failure
        const failureStats = {
            successful: false,
            error: error.message,
            phase: 'feed_playback',
            broadcast_id: broadcast?.id
        };
        notifyBroadcastEnd(failureStats).catch(console.error);
    }
}

// Close the feed studio interface
export function closeFeedStudio() {
    // Stop any playing broadcast
    stopPlayback(currentlyPlayingId, isPlayingRef);
    
    // Hide the studio interface
    hideFeedStudio();
    
    // Update the play buttons in the feed
    updatePlayingState(currentlyPlayingId, false);
    
    // Notify server about broadcast end if one was active
    if (currentlyPlayingId) {
        const endStats = {
            successful: true,
            ended_by: 'user_close',
            broadcast_id: currentlyPlayingId
        };
        notifyBroadcastEnd(endStats).catch(console.error);
    }
    
    // Reset broadcast state
    currentlyPlayingId = null;
    isPlayingRef.current = false;
    isLoadingBroadcast = false;
    wasBroadcastCanceled = false;
    
    // Release the broadcast lock
    broadcastLock = false;
    
    // Clear loading status
    feedElements.feedStatus.textContent = "";
    
    // CRITICAL FIX: Force reset all audio elements to ensure clean state
    const allAudio = document.querySelectorAll('audio');
    allAudio.forEach(audio => {
        try {
            audio.pause();
            audio.currentTime = 0;
        } catch (e) {
            console.error("Error resetting audio:", e);
        }
    });
    
    // Refresh the feed to show items
    refreshFeed();
}

// Get currently playing broadcast ID
export function getCurrentlyPlayingId() {
    return currentlyPlayingId;
}

// Check if a broadcast is currently loading
export function isLoadingAnyBroadcast() {
    return isLoadingBroadcast;
}

// Check if broadcast loading was canceled
export function wasBroadcastCanceledByUser() {
    return wasBroadcastCanceled;
}