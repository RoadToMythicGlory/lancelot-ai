// Channel ordering constants - MUST follow this exact order throughout the app
// Order specified by business requirements: 5 Sport, 5 Plus, 5 Gold, 5 Live, 5 Stars

export const CHANNEL_ORDER = [
  'CHANNEL 1',           // 5 Sport
  'CHANNEL 2',      // 5 Plus  
  'CHANNEL 3',      // 5 Gold
  'CHANNEL 4',      // 5 Live
  'CHANNEL 5',     // 5 Stars
] as const;

export const CHANNEL_ORDER_WITH_4K = [
  'CHANNEL 1',           // 5 Sport
  'CHANNEL 2',      // 5 Plus
  'CHANNEL 3',      // 5 Gold
  'CHANNEL 4',      // 5 Live
  'CHANNEL 5',     // 5 Stars
  'CHANNEL 1 4K',        // 5 Sport 4K
] as const;

export const CHANNEL_ORDER_WITH_EMPTY = [
  '',                  // Empty option
  'CHANNEL 1',           // 5 Sport
  'CHANNEL 2',      // 5 Plus
  'CHANNEL 3',      // 5 Gold
  'CHANNEL 4',      // 5 Live
  'CHANNEL 5',     // 5 Stars
  'CHANNEL 1 4K',        // 5 Sport 4K
] as const;

// Parallel channel options (nullable - empty string means no parallel channel)
export const PARALLEL_CHANNEL_OPTIONS = [
  '',                  // No parallel channel (default - empty)
  'CHANNEL 1',           // 5 Sport
  'CHANNEL 2',      // 5 Plus
  'CHANNEL 3',      // 5 Gold
  'CHANNEL 4',      // 5 Live
  'CHANNEL 5',     // 5 Stars
  'CHANNEL 1 4K',        // 5 Sport 4K
] as const;

// Mapping from English/abbreviated names to Hebrew full names
export const CHANNEL_MAPPINGS: Record<string, string> = {
  // English variants - comprehensive mapping
  '5 SPORT 4K': 'CHANNEL 1 4K',
  'SPORT 4K': 'CHANNEL 1 4K',
  '5SPORT4K': 'CHANNEL 1 4K',
  'CHANNEL1 4K': 'CHANNEL 1 4K',
  '5 SPORT': 'CHANNEL 1',
  'SPORT': 'CHANNEL 1',
  '5SPORT': 'CHANNEL 1',
  'CHANNEL1': 'CHANNEL 1',
  '5 LIVE': 'CHANNEL 4',
  'LIVE': 'CHANNEL 4',
  '5LIVE': 'CHANNEL 4',
  'SPORT LIVE': 'CHANNEL 4',
  '5 PLUS': 'CHANNEL 2',
  'PLUS': 'CHANNEL 2',
  '5PLUS': 'CHANNEL 2',
  'SPORT PLUS': 'CHANNEL 2',
  '5 STARS': 'CHANNEL 5',
  'STARS': 'CHANNEL 5',
  '5STARS': 'CHANNEL 5',
  'SPORT STARS': 'CHANNEL 5',
  '5 GOLD': 'CHANNEL 3',
  'GOLD': 'CHANNEL 3',
  '5GOLD': 'CHANNEL 3',
  'SPORT GOLD': 'CHANNEL 3',
  // Additional English patterns
  'CHANNEL 1': 'CHANNEL 1',
  'CHANNEL 4': 'CHANNEL 4',
  'CHANNEL 2': 'CHANNEL 2',
  'CHANNEL 3': 'CHANNEL 3',
  'CHANNEL 5': 'CHANNEL 5',
};

// Helper function to normalize channel name to Hebrew
export const normalizeChannelToHebrew = (channel: string): string => {
  const upperChannel = channel.toUpperCase().trim();
  
  // Try exact match first
  if (CHANNEL_MAPPINGS[upperChannel]) {
    return CHANNEL_MAPPINGS[upperChannel];
  }
  
  // Try substring matches (longer patterns first)
  const patterns = Object.keys(CHANNEL_MAPPINGS).sort((a, b) => b.length - a.length);
  for (const pattern of patterns) {
    if (upperChannel.includes(pattern)) {
      return CHANNEL_MAPPINGS[pattern];
    }
  }
  
  // If already in Hebrew format, return as is
  if (/[\u0590-\u05FF]/.test(channel)) {
    return channel;
  }
  
  // Default fallback
  return 'CHANNEL 1';
};

export type ChannelName = typeof CHANNEL_ORDER[number] | 'CHANNEL 1 4K'; 