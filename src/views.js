// Feed view management - switching between views and rendering broadcasts

import { feedElements } from './ui.js';
import { getCurrentUser } from '../database.js';
import { handlePlayBroadcast, handleShareBroadcast, handleDeleteBroadcast } from './actions.js';
import { 
  sanitizeDomElements, 
  setupSanitizationObserver, 
  sanitizeTopic 
} from './sanitize.js';

// Current view mode
let currentFeedView = 'my'; // 'my' or 'public'
let sanitizationObserver = null;

// Switch between feed views
export function switchFeedView(view) {
    currentFeedView = view;
    
    // Update active tab
    if (view === 'my') {
        feedElements.myBroadcastsTab.classList.add('active');
        feedElements.publicBroadcastsTab.classList.remove('active');
        feedElements.feedViewLabel.textContent = 'Currently viewing: My Broadcasts';
    } else {
        feedElements.publicBroadcastsTab.classList.add('active');
        feedElements.myBroadcastsTab.classList.remove('active');
        feedElements.feedViewLabel.textContent = 'Currently viewing: Public Broadcasts';
    }
}

// Get current view mode
export function getCurrentView() {
    return currentFeedView;
}

// Render broadcasts to the feed with proper access control
export async function renderBroadcasts(broadcasts, isPlayingRef) {
    // Don't update the feed list if we're currently playing a broadcast
    if (isPlayingRef.current && feedElements.feedTab.classList.contains('feed-studio-active')) {
        return;
    }
    
    // Clear the feed
    feedElements.feedContainer.innerHTML = '';
    
    // Set up DOM sanitization observer if it doesn't exist
    if (!sanitizationObserver && feedElements.feedContainer) {
        sanitizationObserver = setupSanitizationObserver(feedElements.feedContainer);
    }
    
    if (!broadcasts || broadcasts.length === 0) {
        feedElements.feedContainer.innerHTML = `
            <div class="feed-no-items">
                ${currentFeedView === 'my' 
                  ? 'You haven\'t created any broadcasts yet. Create one in the Broadcast Studio!'
                  : 'No public broadcasts found. Share your broadcasts for others to see!'}
            </div>
        `;
        
        // Sanitize even the empty state message
        sanitizeDomElements(feedElements.feedContainer);
        return;
    }
    
    try {
        // Get current user for ownership checks
        const currentUser = await getCurrentUser();
        
        // Final security filtering - only include broadcasts that pass ALL ownership checks
        const filteredBroadcasts = broadcasts.filter(broadcast => {
            if (currentFeedView === 'my') {
                // For "My Broadcasts" tab, only show broadcasts created by this user
                return broadcast.username === currentUser.username;
            } else {
                // For "Public Broadcasts" tab, only show public broadcasts
                return broadcast.visibility === 'public';
            }
        });
        
        if (filteredBroadcasts.length === 0) {
            feedElements.feedContainer.innerHTML = `
                <div class="feed-no-items">
                    ${currentFeedView === 'my' 
                      ? 'You haven\'t created any broadcasts yet. Create one in the Broadcast Studio!'
                      : 'No public broadcasts found. Share your broadcasts for others to see!'}
                </div>
            `;
            
            // Sanitize even the empty state message
            sanitizeDomElements(feedElements.feedContainer);
            return;
        }
        
        console.log("Rendering broadcasts:", filteredBroadcasts);
        
        // Add each broadcast to the feed
        filteredBroadcasts.forEach(broadcast => {
            // Ensure broadcast topic is sanitized
            const sanitizedTopic = sanitizeTopic(broadcast.topic);
            
            // Create a new feed item
            const feedItem = document.createElement('div');
            feedItem.className = 'feed-item';
            feedItem.id = `feed-item-${broadcast.id}`;
            
            // Format the timestamp
            const timestamp = new Date(broadcast.timestamp);
            const formattedDate = timestamp.toLocaleDateString();
            const formattedTime = timestamp.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
            
            // Check if current user is the owner of this broadcast - strict username comparison
            const isOwnBroadcast = broadcast.username === currentUser.username;
            
            // Create the feed item HTML
            feedItem.innerHTML = `
                <div class="feed-item-header">
                    <div class="feed-item-title">${sanitizedTopic}</div>
                    <div class="feed-item-time">${formattedDate} at ${formattedTime}</div>
                </div>
                <div class="feed-item-creator">
                    <img class="feed-creator-avatar" src="https://images.websim.ai/avatar/${broadcast.username}" alt="Avatar">
                    By: ${broadcast.username} ${isOwnBroadcast ? '(You)' : ''}
                </div>
                <div class="feed-item-meta">
                    <div class="feed-visibility-tag feed-tag-${broadcast.visibility}">
                        ${broadcast.visibility.charAt(0).toUpperCase() + broadcast.visibility.slice(1)}
                    </div>
                    <div class="feed-item-playing-indicator">
                        <span class="recording-dot"></span> Now Playing
                    </div>
                </div>
                <button class="feed-item-play-button" data-id="${broadcast.id}">
                    <span class="feed-play-icon">▶</span> Play Broadcast
                </button>
                ${isOwnBroadcast && currentFeedView === 'my' ? `
                    <div class="feed-item-actions">
                        ${broadcast.visibility === 'public' ? `
                            <button class="feed-action-button feed-action-shared" disabled>
                                <span class="feed-share-icon">✓</span> Shared
                            </button>
                        ` : `
                            <button class="feed-action-button feed-action-share" data-id="${broadcast.id}">
                                <span class="feed-share-icon">↗</span> Share
                            </button>
                        `}
                        <button class="feed-action-button feed-action-delete" data-id="${broadcast.id}">
                            <span class="feed-delete-icon">×</span> Delete
                        </button>
                    </div>
                ` : ''}
                ${currentFeedView === 'public' && !isOwnBroadcast ? `
                    <div class="feed-item-shared-by">
                        Shared by ${broadcast.username}
                    </div>
                ` : ''}
            `;
            
            // Sanitize the feed item DOM
            sanitizeDomElements(feedItem);
            
            // Add to the feed container
            feedElements.feedContainer.appendChild(feedItem);
            
            // Add event listener to play button
            const playButton = feedItem.querySelector('.feed-item-play-button');
            playButton.addEventListener('click', () => {
                console.log("Play button clicked for broadcast:", broadcast);
                handlePlayBroadcast(broadcast);
            });
            
            // Add event listeners for action buttons (if they exist)
            if (isOwnBroadcast && currentFeedView === 'my') {
                // Share button
                const shareButton = feedItem.querySelector('.feed-action-share');
                if (shareButton) {
                    shareButton.addEventListener('click', (e) => {
                        e.stopPropagation();
                        handleShareBroadcast(broadcast.id);
                    });
                }
                
                // Delete button
                const deleteButton = feedItem.querySelector('.feed-action-delete');
                if (deleteButton) {
                    deleteButton.addEventListener('click', (e) => {
                        e.stopPropagation();
                        handleDeleteBroadcast(broadcast.id);
                    });
                }
            }
        });
        
        // Perform a final DOM sanitization after all items are added
        sanitizeDomElements(feedElements.feedContainer);
        
    } catch (error) {
        console.error("Error rendering broadcasts:", error);
        feedElements.feedContainer.innerHTML = `
            <div class="feed-no-items">
                Error displaying broadcasts. Please try again.
            </div>
        `;
        
        // Sanitize even the error message
        sanitizeDomElements(feedElements.feedContainer);
    }
}

// Update feed status message
export function updateFeedStatus(broadcasts) {
    if (!broadcasts || broadcasts.length === 0) {
        if (currentFeedView === 'my') {
            feedElements.feedStatus.textContent = 'You haven\'t created any broadcasts yet. Create one in the Broadcast Studio!';
        } else {
            feedElements.feedStatus.textContent = 'No public broadcasts found. Share your broadcasts for others to see!';
        }
    } else {
        feedElements.feedStatus.textContent = `Showing ${broadcasts.length} broadcast${broadcasts.length !== 1 ? 's' : ''}`;
    }
}

// Clean up sanitization observer when needed
export function cleanupSanitizationObserver() {
    if (sanitizationObserver) {
        sanitizationObserver.disconnect();
        sanitizationObserver = null;
    }
}