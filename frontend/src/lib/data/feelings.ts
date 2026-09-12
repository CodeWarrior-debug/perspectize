/**
 * Feel-wheel data: the 20-emoji core wheel (opposite pairs, Plutchik/Cowen &
 * Keltner grounded) plus a curated extended set for the "search more" picker.
 *
 * See docs/superpowers/specs/2026-09-12-feel-wheel-design.md for the sources
 * and the reasoning behind the wheel layout and family groupings.
 *
 * This module is intentionally NOT imported by anything that ships in the
 * initial bundle — only FeelWheel.svelte (itself dynamic-imported) touches
 * it, and the extended set specifically is lazy-loaded on first search.
 */

export interface WheelFeeling {
	/** Position in degrees, clockwise from 12 o'clock (0). */
	angle: number;
	emoji: string;
	label: string;
	family: string;
}

export interface ExtendedFeeling {
	emoji: string;
	label: string;
	family: string;
	keywords: string[];
}

/**
 * The 20-emoji core wheel. Row N at `angle` and row N at `angle + 180` are
 * direct opposites — see the design doc's two-table layout.
 */
export const FEEL_WHEEL: WheelFeeling[] = [
	{ angle: 0, emoji: '🥰', label: 'Love', family: 'love' },
	{ angle: 18, emoji: '😄', label: 'Joyful', family: 'joy' },
	{ angle: 36, emoji: '🤗', label: 'Trusting', family: 'trust' },
	{ angle: 54, emoji: '🤞', label: 'Hopeful', family: 'anticipation' },
	{ angle: 72, emoji: '😎', label: 'Cool', family: 'cool' },
	{ angle: 90, emoji: '🤯', label: 'Mind-blown', family: 'surprise-positive' },
	{ angle: 108, emoji: '😅', label: 'Sweat-smile', family: 'awkward-positive' },
	{ angle: 126, emoji: '😏', label: 'Confident', family: 'confidence' },
	{ angle: 144, emoji: '😌', label: 'Peaceful', family: 'calm' },
	{ angle: 162, emoji: '🥹', label: 'Nostalgic', family: 'nostalgia' },
	{ angle: 180, emoji: '🤬', label: 'Hate', family: 'hate' },
	{ angle: 198, emoji: '😢', label: 'Sad', family: 'sadness' },
	{ angle: 216, emoji: '🤢', label: 'Disgusted', family: 'disgust' },
	{ angle: 234, emoji: '😲', label: 'Surprised', family: 'surprise' },
	{ angle: 252, emoji: '😐', label: 'Bored', family: 'boredom' },
	{ angle: 270, emoji: '😑', label: 'Meh', family: 'indifference' },
	{ angle: 288, emoji: '😬', label: 'Awkward', family: 'awkward' },
	{ angle: 306, emoji: '😟', label: 'Insecure', family: 'insecurity' },
	{ angle: 324, emoji: '😰', label: 'Anxious', family: 'anxiety' },
	{ angle: 342, emoji: '😕', label: 'Confused', family: 'confusion' },
];

/**
 * Extended curated set for the "search more" picker, grouped by the same
 * families as the core wheel. Not the full Unicode emoji range — deliberately
 * scoped to feeling/reaction emoji so search stays relevant. Lazy-imported
 * from FeelWheel.svelte only when the search UI opens.
 */
export const EXTENDED_FEELINGS: ExtendedFeeling[] = [
	// love
	{ emoji: '😍', label: 'Adoring', family: 'love', keywords: ['heart-eyes', 'smitten', 'crush'] },
	{ emoji: '💕', label: 'Affectionate', family: 'love', keywords: ['fond', 'warm', 'tender'] },
	{ emoji: '🥲', label: 'Touched', family: 'love', keywords: ['bittersweet', 'moved', 'grateful-tears'] },
	{ emoji: '🫶', label: 'Appreciative', family: 'love', keywords: ['heart-hands', 'thankful', 'caring'] },
	{ emoji: '😻', label: 'Smitten', family: 'love', keywords: ['heart-eyes-cat', 'infatuated'] },

	// joy
	{ emoji: '😁', label: 'Cheerful', family: 'joy', keywords: ['grinning', 'happy', 'delighted'] },
	{ emoji: '🤣', label: 'Hilarious', family: 'joy', keywords: ['rofl', 'laughing', 'funny'] },
	{ emoji: '😆', label: 'Amused', family: 'joy', keywords: ['laughing', 'giggly'] },
	{ emoji: '🙃', label: 'Playful', family: 'joy', keywords: ['silly', 'lighthearted', 'goofy'] },
	{ emoji: '🥳', label: 'Celebratory', family: 'joy', keywords: ['party', 'festive', 'excited'] },

	// trust
	{ emoji: '🤝', label: 'Collaborative', family: 'trust', keywords: ['handshake', 'partnership', 'reliable'] },
	{ emoji: '🫂', label: 'Supported', family: 'trust', keywords: ['comforted', 'held', 'safe'] },
	{ emoji: '🙏', label: 'Grateful', family: 'trust', keywords: ['thankful', 'appreciative', 'relieved'] },
	{ emoji: '😊', label: 'Reassured', family: 'trust', keywords: ['warm', 'secure', 'content'] },

	// anticipation
	{ emoji: '👀', label: 'Eager', family: 'anticipation', keywords: ['watching', 'curious', 'intrigued'] },
	{ emoji: '⏳', label: 'Expectant', family: 'anticipation', keywords: ['waiting', 'suspense'] },
	{ emoji: '🙌', label: 'Pumped', family: 'anticipation', keywords: ['excited', 'ready', 'hyped'] },
	{ emoji: '🤔', label: 'Curious', family: 'anticipation', keywords: ['wondering', 'thinking', 'intrigued'] },

	// cool
	{ emoji: '🕶️', label: 'Unbothered', family: 'cool', keywords: ['nonchalant', 'relaxed', 'aloof'] },
	{ emoji: '🤙', label: 'Chill', family: 'cool', keywords: ['shaka', 'easygoing', 'laid-back'] },
	{ emoji: '😇', label: 'Blessed', family: 'cool', keywords: ['innocent', 'lucky', 'grateful'] },

	// surprise-positive
	{ emoji: '🤩', label: 'Starstruck', family: 'surprise-positive', keywords: ['amazed', 'awed', 'wowed'] },
	{ emoji: '✨', label: 'Delighted', family: 'surprise-positive', keywords: ['sparkly', 'pleasantly-surprised'] },
	{ emoji: '🎆', label: 'Awestruck', family: 'surprise-positive', keywords: ['wonder', 'spectacular'] },

	// awkward-positive
	{ emoji: '😳', label: 'Flustered', family: 'awkward-positive', keywords: ['blushing', 'embarrassed-happy'] },
	{ emoji: '🫠', label: 'Melting', family: 'awkward-positive', keywords: ['flustered', 'overwhelmed-relief'] },
	{ emoji: '🙈', label: 'Bashful', family: 'awkward-positive', keywords: ['shy', 'embarrassed', 'covering-eyes'] },

	// confidence
	{ emoji: '💪', label: 'Empowered', family: 'confidence', keywords: ['strong', 'capable', 'determined'] },
	{ emoji: '😤', label: 'Determined', family: 'confidence', keywords: ['resolved', 'driven', 'proud'] },
	{ emoji: '👑', label: 'Proud', family: 'confidence', keywords: ['accomplished', 'triumphant'] },

	// calm
	{ emoji: '🧘', label: 'Centered', family: 'calm', keywords: ['meditative', 'balanced', 'grounded'] },
	{ emoji: '🌊', label: 'Serene', family: 'calm', keywords: ['tranquil', 'flowing', 'easy'] },
	{ emoji: '😴', label: 'Content', family: 'calm', keywords: ['sleepy', 'satisfied', 'restful'] },

	// nostalgia
	{ emoji: '📼', label: 'Wistful', family: 'nostalgia', keywords: ['retro', 'sentimental', 'longing'] },
	{ emoji: '🌇', label: 'Reflective', family: 'nostalgia', keywords: ['bittersweet', 'reminiscent'] },

	// hate
	{ emoji: '😡', label: 'Furious', family: 'hate', keywords: ['livid', 'enraged'] },
	{ emoji: '💢', label: 'Irritated', family: 'hate', keywords: ['annoyed', 'angry', 'fed-up'] },
	{ emoji: '😾', label: 'Hostile', family: 'hate', keywords: ['grumpy', 'combative'] },

	// sadness
	{ emoji: '😭', label: 'Heartbroken', family: 'sadness', keywords: ['sobbing', 'devastated', 'grieving'] },
	{ emoji: '💔', label: 'Crushed', family: 'sadness', keywords: ['broken-hearted', 'loss'] },
	{ emoji: '😞', label: 'Disappointed', family: 'sadness', keywords: ['let-down', 'discouraged'] },

	// disgust
	{ emoji: '🤮', label: 'Nauseated', family: 'disgust', keywords: ['revolted', 'sick', 'repulsed'] },
	{ emoji: '🙄', label: 'Disdainful', family: 'disgust', keywords: ['eye-roll', 'contemptuous'] },

	// surprise
	{ emoji: '😱', label: 'Shocked', family: 'surprise', keywords: ['scared', 'stunned', 'startled'] },
	{ emoji: '😵', label: 'Stunned', family: 'surprise', keywords: ['dazed', 'overwhelmed'] },

	// boredom
	{ emoji: '🥱', label: 'Yawning', family: 'boredom', keywords: ['tired', 'uninterested', 'sleepy'] },
	{ emoji: '😪', label: 'Drowsy', family: 'boredom', keywords: ['sleepy', 'checked-out'] },
	{ emoji: '🫥', label: 'Checked-out', family: 'boredom', keywords: ['invisible', 'zoned-out', 'disengaged'] },

	// indifference
	{ emoji: '🤷', label: 'Indifferent', family: 'indifference', keywords: ['shrug', 'whatever', 'unbothered'] },
	{ emoji: '😶', label: 'Blank', family: 'indifference', keywords: ['expressionless', 'neutral'] },
	{ emoji: '🫤', label: 'Unimpressed', family: 'indifference', keywords: ['unmoved', 'lukewarm'] },

	// awkward
	{ emoji: '😓', label: 'Nervous', family: 'awkward', keywords: ['sweating', 'uneasy'] },
	{ emoji: '🫣', label: 'Cringing', family: 'awkward', keywords: ['peeking', 'wincing', 'embarrassed'] },
	{ emoji: '😖', label: 'Uncomfortable', family: 'awkward', keywords: ['confounded', 'squirming'] },

	// insecurity
	{ emoji: '🥺', label: 'Vulnerable', family: 'insecurity', keywords: ['pleading', 'tender', 'exposed'] },
	{ emoji: '😔', label: 'Dejected', family: 'insecurity', keywords: ['down', 'self-doubting'] },
	{ emoji: '🙇', label: 'Self-conscious', family: 'insecurity', keywords: ['apologetic', 'sorry'] },

	// anxiety
	{ emoji: '😨', label: 'Fearful', family: 'anxiety', keywords: ['scared', 'worried', 'afraid'] },
	{ emoji: '🥵', label: 'Overwhelmed', family: 'anxiety', keywords: ['stressed', 'overheated', 'pressured'] },
	{ emoji: '😥', label: 'Uneasy', family: 'anxiety', keywords: ['troubled', 'concerned'] },

	// confusion
	{ emoji: '🤨', label: 'Skeptical', family: 'confusion', keywords: ['doubtful', 'questioning'] },
	{ emoji: '🧐', label: 'Puzzled', family: 'confusion', keywords: ['analyzing', 'scrutinizing'] },
	{ emoji: '😵‍💫', label: 'Disoriented', family: 'confusion', keywords: ['dizzy', 'lost', 'overwhelmed'] },
];

/** Family display order + human-readable headers, for grouped search results. */
export const FAMILY_ORDER: { family: string; header: string }[] = [
	{ family: 'love', header: 'Love' },
	{ family: 'joy', header: 'Joy' },
	{ family: 'trust', header: 'Trust' },
	{ family: 'anticipation', header: 'Anticipation' },
	{ family: 'cool', header: 'Cool' },
	{ family: 'surprise-positive', header: 'Mind-blown' },
	{ family: 'awkward-positive', header: 'Sweat-smile' },
	{ family: 'confidence', header: 'Confidence' },
	{ family: 'calm', header: 'Calm' },
	{ family: 'nostalgia', header: 'Nostalgia' },
	{ family: 'hate', header: 'Hate' },
	{ family: 'sadness', header: 'Sadness' },
	{ family: 'disgust', header: 'Disgust' },
	{ family: 'surprise', header: 'Surprise' },
	{ family: 'boredom', header: 'Boredom' },
	{ family: 'indifference', header: 'Indifference' },
	{ family: 'awkward', header: 'Awkward' },
	{ family: 'insecurity', header: 'Insecurity' },
	{ family: 'anxiety', header: 'Anxiety' },
	{ family: 'confusion', header: 'Confusion' },
];

/** Case-insensitive substring match against label + keywords. */
export function searchExtendedFeelings(query: string): ExtendedFeeling[] {
	const q = query.trim().toLowerCase();
	if (!q) return [];
	return EXTENDED_FEELINGS.filter(
		(f) => f.label.toLowerCase().includes(q) || f.keywords.some((k) => k.includes(q)),
	);
}
