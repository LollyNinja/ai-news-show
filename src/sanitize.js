// Content sanitization utilities for the feed system

// List of blocked media hosts
const BLOCKED_DOMAINS = [
  'youtube.com', 'youtu.be', 'vimeo.com', 'dailymotion.com', 'twitch.tv',
  'streamable.com', 'soundcloud.com', 'spotify.com', 'apple.music.com',
  'tiktok.com', 'instagram.com/reel', 'facebook.com/watch', 'twitter.com/i/status',
  'vk.com/video', 'tiktok.com', 'mixcloud.com', 'bandcamp.com',
  'periscope.tv', 'linkedin.com/video'
];

// Check if text contains URLs to blocked media domains
export function containsBlockedMediaUrls(text) {
  if (!text) return false;
  
  // Convert to lowercase for case-insensitive matching
  const lowerText = text.toLowerCase();
  
  // Check for common URL patterns
  for (const domain of BLOCKED_DOMAINS) {
    // Check different URL formats
    if (
      lowerText.includes(`http://${domain}`) ||
      lowerText.includes(`https://${domain}`) ||
      lowerText.includes(`www.${domain}`) ||
      lowerText.includes(`${domain}/`) ||
      // Also check for domain boundaries to catch bare domains
      new RegExp(`[^a-z0-9]${domain.replace(/\./g, '\\.')}[^a-z0-9]`).test(` ${lowerText} `)
    ) {
      console.warn(`Blocked media URL detected: ${domain}`);
      return true;
    }
  }
  
  return false;
}

// Sanitize HTML content - remove potentially harmful tags
export function sanitizeHtml(content) {
  if (!content) return content;
  
  // Handle both string and array content
  if (Array.isArray(content)) {
    return content.map(item => {
      if (item && typeof item === 'object' && item.text) {
        return {
          ...item,
          text: sanitizeHtml(item.text)
        };
      }
      return item;
    });
  }
  
  if (typeof content !== 'string') return content;
  
  // Remove potentially harmful tags
  let sanitized = content
    // Remove video tags
    .replace(/<\s*video[^>]*>[\s\S]*?<\s*\/\s*video\s*>/gi, '[Video content removed]')
    .replace(/<\s*video[^>]*>/gi, '[Video tag removed]')
    
    // Remove audio tags
    .replace(/<\s*audio[^>]*>[\s\S]*?<\s*\/\s*audio\s*>/gi, '[Audio content removed]')
    .replace(/<\s*audio[^>]*>/gi, '[Audio tag removed]')
    
    // Remove iframe tags
    .replace(/<\s*iframe[^>]*>[\s\S]*?<\s*\/\s*iframe\s*>/gi, '[External content removed]')
    .replace(/<\s*iframe[^>]*>/gi, '[Iframe tag removed]')
    
    // Remove source tags
    .replace(/<\s*source[^>]*>/gi, '[Media source removed]')
    
    // Remove embed tags
    .replace(/<\s*embed[^>]*>[\s\S]*?<\s*\/\s*embed\s*>/gi, '[Embedded content removed]')
    .replace(/<\s*embed[^>]*>/gi, '[Embed tag removed]')
    
    // Remove object tags
    .replace(/<\s*object[^>]*>[\s\S]*?<\s*\/\s*object\s*>/gi, '[Object content removed]')
    .replace(/<\s*object[^>]*>/gi, '[Object tag removed]')
    
    // Remove script tags
    .replace(/<\s*script[^>]*>[\s\S]*?<\s*\/\s*script\s*>/gi, '')
    .replace(/<\s*script[^>]*>/gi, '')
    
    // Remove on* event handlers
    .replace(/\son\w+\s*=\s*["'][^"']*["']/gi, '');
  
  return sanitized;
}

// Validate and sanitize a broadcast topic
export function sanitizeTopic(topic) {
  if (!topic) return '';
  
  // Check for blocked media URLs
  if (containsBlockedMediaUrls(topic)) {
    return '[Removed - contained inappropriate links]';
  }
  
  // Sanitize HTML content
  return sanitizeHtml(topic);
}

// Validate and sanitize a full broadcast dialogue
export function sanitizeDialogue(dialogue) {
  if (!dialogue || !Array.isArray(dialogue)) return [];
  
  return dialogue.map(segment => {
    if (!segment) return segment;
    
    return {
      ...segment,
      text: sanitizeHtml(segment.text)
    };
  });
}

// Sanitize a complete broadcast object
export function sanitizeBroadcast(broadcast) {
  if (!broadcast) return broadcast;
  
  return {
    ...broadcast,
    topic: sanitizeTopic(broadcast.topic),
    dialogue: sanitizeDialogue(broadcast.dialogue)
  };
}

// DOM sanitization - remove any unauthorized media elements
export function sanitizeDomElements(container) {
  if (!container) return;
  
  // Find all potentially harmful elements
  const mediaElements = container.querySelectorAll('video, audio, iframe, source, embed, object');
  
  // Remove them
  mediaElements.forEach(element => {
    console.warn('Removing unauthorized media element:', element);
    element.parentNode.removeChild(element);
  });
  
  // Also check for inline event handlers
  const allElements = container.querySelectorAll('*');
  allElements.forEach(element => {
    // Remove all on* attributes
    for (const attr of element.attributes) {
      if (attr.name.startsWith('on')) {
        console.warn(`Removing inline event handler: ${attr.name} on`, element);
        element.removeAttribute(attr.name);
      }
    }
  });
}

// Set up a DOM mutation observer to constantly sanitize content
export function setupSanitizationObserver(targetNode) {
  if (!targetNode || !window.MutationObserver) return null;
  
  // Create a configuration object
  const config = { 
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['src', 'srcdoc', 'data', 'href']
  };
  
  // Create an observer instance
  const observer = new MutationObserver((mutationsList) => {
    for (const mutation of mutationsList) {
      // If nodes were added
      if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
        // Sanitize the container again
        sanitizeDomElements(targetNode);
      }
      // If attributes were modified
      else if (mutation.type === 'attributes') {
        const element = mutation.target;
        // Check if this is a media element getting a src
        if (
          (element.tagName === 'VIDEO' || 
           element.tagName === 'AUDIO' || 
           element.tagName === 'IFRAME' ||
           element.tagName === 'SOURCE' ||
           element.tagName === 'EMBED' ||
           element.tagName === 'OBJECT') &&
          (mutation.attributeName === 'src' || 
           mutation.attributeName === 'srcdoc' ||
           mutation.attributeName === 'data')
        ) {
          // Remove the element
          if (element.parentNode) {
            console.warn('Removing media element with modified src:', element);
            element.parentNode.removeChild(element);
          }
        }
      }
    }
  });
  
  // Start observing
  observer.observe(targetNode, config);
  
  return observer;
}