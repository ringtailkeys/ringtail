import { feedbackKeyframes } from "./feedback";
import { modalKeyframes } from "./modal";
import { statusKeyframes } from "./status";

/**
 * Every @ringtail/ui animation keyframe in one string. Mount once in a <style>
 * tag (Storybook preview, the dashboard shell) so live dots, spinners, the glint,
 * and modal transitions have their frames. Effortless motion, never a pulsing orb.
 */
export const allKeyframes = `${statusKeyframes}\n${feedbackKeyframes}\n${modalKeyframes}`;
