import { animKeyframes } from "./anim";
import { feedbackKeyframes } from "./feedback";
import { modalKeyframes } from "./modal";
import { statusKeyframes } from "./status";

/**
 * Every @ringtail/ui animation keyframe in one string. Mount once in a <style>
 * tag (Storybook preview, the dashboard shell) so live dots, spinners, the glint,
 * the reveal springs, Rocco's idle loops, and modal transitions have their frames.
 * Effortless motion, never a pulsing orb. Includes the reduced-motion guard.
 */
export const allKeyframes = `${statusKeyframes}\n${feedbackKeyframes}\n${modalKeyframes}\n${animKeyframes}`;
