export interface CardPosition {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ViewportBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

export interface BranchPoint {
  x: number;
  y: number;
  side: 'top' | 'right' | 'bottom' | 'left';
}

export type ArrowStyle = 'curved' | 'straight' | 'elbow';
export type ArrowheadType = 'none' | 'arrow' | 'dot' | 'triangle';
export type StrokeStyle = 'solid' | 'dashed' | 'dotted';

/**
 * Calculate the position of branch points on a card
 * Returns coordinates for dots on all 4 sides (top, right, bottom, left)
 */
export function calculateBranchPoints(card: CardPosition): BranchPoint[] {
  return [
    {
      x: card.x + card.width / 2,
      y: card.y,
      side: 'top' as const,
    },
    {
      x: card.x + card.width,
      y: card.y + card.height / 2,
      side: 'right' as const,
    },
    {
      x: card.x + card.width / 2,
      y: card.y + card.height,
      side: 'bottom' as const,
    },
    {
      x: card.x,
      y: card.y + card.height / 2,
      side: 'left' as const,
    },
  ];
}

/**
 * Generate an SVG path for a curved arrow from source to target
 * Uses cubic bezier curve with intelligent control point placement (Obsidian-style)
 */
export function drawCurvedPath(
  from: { x: number; y: number },
  to: { x: number; y: number },
  fromSide?: 'top' | 'right' | 'bottom' | 'left',
  toSide?: 'top' | 'right' | 'bottom' | 'left'
): string {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const distance = Math.sqrt(dx * dx + dy * dy);

  // Control point offset - larger offset creates more pronounced S-curves
  // Scale with distance but cap at reasonable values
  const minOffset = 60;
  const maxOffset = 200;
  const offset = Math.min(Math.max(distance * 0.5, minOffset), maxOffset);

  let controlX1 = from.x;
  let controlY1 = from.y;
  let controlX2 = to.x;
  let controlY2 = to.y;

  // Adjust control points based on which side of the card the connection is from
  // Control points extend perpendicular to the connection side for natural curves
  if (fromSide === 'right') {
    controlX1 = from.x + offset;
    controlY1 = from.y;
  } else if (fromSide === 'left') {
    controlX1 = from.x - offset;
    controlY1 = from.y;
  } else if (fromSide === 'bottom') {
    controlX1 = from.x;
    controlY1 = from.y + offset;
  } else if (fromSide === 'top') {
    controlX1 = from.x;
    controlY1 = from.y - offset;
  } else {
    // Default: extend horizontally
    controlX1 = from.x + offset;
    controlY1 = from.y;
  }

  // Adjust second control point based on target side
  // This creates the S-curve effect when sides oppose each other
  if (toSide === 'right') {
    controlX2 = to.x + offset;
    controlY2 = to.y;
  } else if (toSide === 'left') {
    controlX2 = to.x - offset;
    controlY2 = to.y;
  } else if (toSide === 'bottom') {
    controlX2 = to.x;
    controlY2 = to.y + offset;
  } else if (toSide === 'top') {
    controlX2 = to.x;
    controlY2 = to.y - offset;
  } else {
    // Default: extend horizontally
    controlX2 = to.x - offset;
    controlY2 = to.y;
  }

  return `M ${from.x} ${from.y} C ${controlX1} ${controlY1}, ${controlX2} ${controlY2}, ${to.x} ${to.y}`;
}

/**
 * Generate an SVG path for an elbow/orthogonal arrow
 * Creates right-angle connections like flowchart connectors
 */
export function drawElbowPath(
  from: { x: number; y: number },
  to: { x: number; y: number },
  fromSide?: 'top' | 'right' | 'bottom' | 'left',
  toSide?: 'top' | 'right' | 'bottom' | 'left'
): string {
  // Offset distance from card edge before making a turn
  const offset = 30;

  // Calculate point after exiting source card with offset
  let p1x = from.x;
  let p1y = from.y;

  if (fromSide === 'right') {
    p1x = from.x + offset;
    p1y = from.y;
  } else if (fromSide === 'left') {
    p1x = from.x - offset;
    p1y = from.y;
  } else if (fromSide === 'bottom') {
    p1x = from.x;
    p1y = from.y + offset;
  } else if (fromSide === 'top') {
    p1x = from.x;
    p1y = from.y - offset;
  }

  // Calculate point before entering target card with offset
  let p2x = to.x;
  let p2y = to.y;

  if (toSide === 'right') {
    p2x = to.x + offset;
    p2y = to.y;
  } else if (toSide === 'left') {
    p2x = to.x - offset;
    p2y = to.y;
  } else if (toSide === 'bottom') {
    p2x = to.x;
    p2y = to.y + offset;
  } else if (toSide === 'top') {
    p2x = to.x;
    p2y = to.y - offset;
  }

  // Now create the elbow path with a single 90-degree turn
  // The turn should happen at the point where we align with the target entry axis

  // Determine the corner point based on fromSide and toSide
  let cornerX: number;
  let cornerY: number;

  if (fromSide === 'right' || fromSide === 'left') {
    // Exiting horizontally, so extend horizontal first, then turn vertical
    cornerX = p1x;
    cornerY = p2y;
  } else {
    // Exiting vertically, so extend vertical first, then turn horizontal
    cornerX = p2x;
    cornerY = p1y;
  }

  // Build the path: start -> p1 (after offset) -> corner (90° turn) -> p2 (before target) -> end
  return `M ${from.x} ${from.y} L ${p1x} ${p1y} L ${cornerX} ${cornerY} L ${p2x} ${p2y} L ${to.x} ${to.y}`;
}

/**
 * Generate an SVG path based on arrow style
 * Dispatches to the appropriate path function
 */
export function drawArrowPath(
  from: { x: number; y: number },
  to: { x: number; y: number },
  style: ArrowStyle = 'curved',
  fromSide?: 'top' | 'right' | 'bottom' | 'left',
  toSide?: 'top' | 'right' | 'bottom' | 'left'
): string {
  switch (style) {
    case 'straight':
      return drawStraightPath(from, to);
    case 'elbow':
      return drawElbowPath(from, to, fromSide, toSide);
    case 'curved':
    default:
      return drawCurvedPath(from, to, fromSide, toSide);
  }
}

/**
 * Generate an SVG path for a straight line (used during drag preview)
 */
export function drawStraightPath(
  from: { x: number; y: number },
  to: { x: number; y: number }
): string {
  return `M ${from.x} ${from.y} L ${to.x} ${to.y}`;
}

/**
 * Get the center point of a card
 */
export function getCardCenter(card: CardPosition): { x: number; y: number } {
  return {
    x: card.x + card.width / 2,
    y: card.y + card.height / 2,
  };
}

/**
 * Get the closest edge point on a card to a given point
 * Returns the middle of the closest edge
 */
export function getClosestEdgePoint(
  card: CardPosition,
  fromPoint: { x: number; y: number }
): { x: number; y: number } {
  const branchPoints = calculateBranchPoints(card);

  // Find the closest branch point (edge midpoint) to the source point
  let closestPoint = branchPoints[0];
  let minDistance = Infinity;

  branchPoints.forEach((point) => {
    const distance = Math.sqrt(
      Math.pow(point.x - fromPoint.x, 2) + Math.pow(point.y - fromPoint.y, 2)
    );
    if (distance < minDistance) {
      minDistance = distance;
      closestPoint = point;
    }
  });

  return { x: closestPoint.x, y: closestPoint.y };
}

/**
 * Determine which side of the card is closest to a point
 */
export function getBranchSide(
  card: CardPosition,
  point: { x: number; y: number }
): 'top' | 'right' | 'bottom' | 'left' {
  const center = getCardCenter(card);
  const dx = point.x - center.x;
  const dy = point.y - center.y;

  // Calculate angle from center to point
  const angle = Math.atan2(dy, dx) * (180 / Math.PI);

  // Determine side based on angle quadrant
  if (angle >= -45 && angle < 45) return 'right';
  if (angle >= 45 && angle < 135) return 'bottom';
  if (angle >= -135 && angle < -45) return 'top';
  return 'left';
}

/**
 * Get stroke dash array pattern based on stroke style
 */
export function getStrokeDashArray(style: StrokeStyle): string | undefined {
  switch (style) {
    case 'dashed':
      return '8,4';
    case 'dotted':
      return '2,4';
    case 'solid':
    default:
      return undefined;
  }
}

/**
 * Calculate the angle of a line for arrowhead rotation
 */
export function calculateAngle(
  from: { x: number; y: number },
  to: { x: number; y: number }
): number {
  return Math.atan2(to.y - from.y, to.x - from.x) * (180 / Math.PI);
}

/**
 * Calculate viewport bounds in canvas coordinates
 * @param viewportWidth - Width of the viewport in pixels
 * @param viewportHeight - Height of the viewport in pixels
 * @param offset - Canvas offset (x, y)
 * @param zoom - Current zoom level
 * @param buffer - Extra buffer around viewport (default 200px) to render cards slightly off-screen
 */
export function calculateViewportBounds(
  viewportWidth: number,
  viewportHeight: number,
  offset: { x: number; y: number },
  zoom: number,
  buffer: number = 200
): ViewportBounds {
  // Convert viewport coordinates to canvas coordinates
  // Account for zoom and offset transformations
  const minX = (-offset.x - buffer) / zoom;
  const maxX = (viewportWidth - offset.x + buffer) / zoom;
  const minY = (-offset.y - buffer) / zoom;
  const maxY = (viewportHeight - offset.y + buffer) / zoom;

  return { minX, maxX, minY, maxY };
}

/**
 * Check if a card is visible within the viewport bounds
 * @param card - The card to check
 * @param bounds - The viewport bounds
 */
export function isCardInViewport(card: CardPosition, bounds: ViewportBounds): boolean {
  // Check if card intersects with viewport bounds
  return !(
    card.x + card.width < bounds.minX ||
    card.x > bounds.maxX ||
    card.y + card.height < bounds.minY ||
    card.y > bounds.maxY
  );
}
