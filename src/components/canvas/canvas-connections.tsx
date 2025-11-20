"use client";

import { useState, useMemo, memo } from "react";
import { Id } from "../../../convex/_generated/dataModel";
import { useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { drawArrowPath, getClosestEdgePoint, calculateBranchPoints } from "@/lib/canvas-utils";
import { X } from "lucide-react";

interface LocalCard {
  _id: Id<"canvasCards">;
  x: number;
  y: number;
  width: number;
  height: number;
  content: string;
}

interface Connection {
  _id: Id<"canvasConnections">;
  sourceCardId: Id<"canvasCards">;
  targetCardId: Id<"canvasCards">;
}

interface CanvasConnectionsProps {
  connections: Connection[];
  cards: LocalCard[];
  zoom: number;
  offset: { x: number; y: number };
}

export const CanvasConnections = memo(function CanvasConnections({
  connections,
  cards,
  zoom,
  offset,
}: CanvasConnectionsProps) {
  const [hoveredConnection, setHoveredConnection] = useState<Id<"canvasConnections"> | null>(null);
  const removeConnection = useMutation(api.canvasConnections.remove);

  const handleDeleteConnection = async (connectionId: Id<"canvasConnections">) => {
    await removeConnection({ id: connectionId });
  };

  // Create a map for fast card lookups
  const cardMap = useMemo(() => {
    const map = new Map<Id<"canvasCards">, LocalCard>();
    cards.forEach(card => map.set(card._id, card));
    return map;
  }, [cards]);

  // Create a serialized key for cards to detect actual position/size changes
  // Only include x, y, width, height - NOT content to prevent unnecessary recalculations
  const cardsPositionKey = useMemo(() => {
    return cards.map(c => `${c._id}:${c.x},${c.y},${c.width},${c.height}`).join('|');
  }, [cards]);

  // Pre-compute all connection paths (optimized to update immediately)
  const connectionPaths = useMemo(() => {
    return connections.map((connection) => {
      const sourceCard = cardMap.get(connection.sourceCardId);
      const targetCard = cardMap.get(connection.targetCardId);

      if (!sourceCard || !targetCard) return null;

      // Calculate branch points inline for maximum performance
      const sourceBranchPoints = calculateBranchPoints(sourceCard);
      const targetBranchPoints = calculateBranchPoints(targetCard);

      // Find the best pair of connection points (minimize distance)
      let closestSourcePoint = sourceBranchPoints[0];
      let closestTargetPoint = targetBranchPoints[0];
      let minDistance = Infinity;

      for (const sourcePoint of sourceBranchPoints) {
        for (const targetPoint of targetBranchPoints) {
          const dx = sourcePoint.x - targetPoint.x;
          const dy = sourcePoint.y - targetPoint.y;
          const distance = dx * dx + dy * dy; // Skip sqrt for performance

          if (distance < minDistance) {
            minDistance = distance;
            closestSourcePoint = sourcePoint;
            closestTargetPoint = targetPoint;
          }
        }
      }

      const path = drawArrowPath(
        { x: closestSourcePoint.x, y: closestSourcePoint.y },
        { x: closestTargetPoint.x, y: closestTargetPoint.y },
        'elbow',
        closestSourcePoint.side,
        closestTargetPoint.side
      );

      const midX = (closestSourcePoint.x + closestTargetPoint.x) / 2;
      const midY = (closestSourcePoint.y + closestTargetPoint.y) / 2;

      return {
        connectionId: connection._id,
        path,
        midX,
        midY,
      };
    }).filter(Boolean);
  }, [connections, cardsPositionKey, cardMap]);

  return (
    <svg
      className="absolute inset-0 pointer-events-none"
      style={{
        width: '100%',
        height: '100%',
        zIndex: 1,
        overflow: 'visible',
        willChange: 'transform',
        contain: 'layout style paint',
      }}
    >
      <defs>
        {/* Arrow marker for connection endpoints */}
        <marker
          id="arrowhead"
          markerWidth="10"
          markerHeight="10"
          refX="9"
          refY="3"
          orient="auto"
          markerUnits="strokeWidth"
        >
          <path
            d="M0,0 L0,6 L9,3 z"
            fill="currentColor"
            className="text-primary"
          />
        </marker>
      </defs>

      <g>
        {connectionPaths.map((pathData) => {
          if (!pathData) return null;

          const isHovered = hoveredConnection === pathData.connectionId;

          return (
            <g key={pathData.connectionId}>
              {/* Main connection line */}
              <path
                d={pathData.path}
                stroke="currentColor"
                strokeWidth={isHovered ? 3 : 2}
                fill="none"
                markerEnd="url(#arrowhead)"
                strokeDasharray="8 4"
                className={isHovered ? 'text-primary' : 'text-muted-foreground'}
                style={{
                  pointerEvents: 'stroke',
                  cursor: 'pointer',
                  transition: 'stroke-width 0.15s ease',
                }}
                onMouseEnter={() => setHoveredConnection(pathData.connectionId)}
                onMouseLeave={() => setHoveredConnection(null)}
              />

              {/* Delete button on hover */}
              {isHovered && (
                <g
                  className="pointer-events-auto cursor-pointer"
                  onClick={() => handleDeleteConnection(pathData.connectionId)}
                  onMouseEnter={() => setHoveredConnection(pathData.connectionId)}
                >
                  {/* Circle background */}
                  <circle
                    cx={pathData.midX}
                    cy={pathData.midY}
                    r={12}
                    fill="currentColor"
                    className="text-destructive"
                  />
                  {/* X icon */}
                  <g transform={`translate(${pathData.midX - 6}, ${pathData.midY - 6})`}>
                    <path
                      d="M 3 3 L 9 9 M 9 3 L 3 9"
                      stroke="white"
                      strokeWidth="2"
                      strokeLinecap="round"
                    />
                  </g>
                </g>
              )}
            </g>
          );
        })}
      </g>
    </svg>
  );
});
