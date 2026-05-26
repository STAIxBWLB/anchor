import { memo, useCallback, type PointerEvent } from "react";

import type { DiagramNode, NodeId } from "../../../lib/diagram/types";

export interface NodeViewProps {
  node: DiagramNode;
  selected: boolean;
  onPointerDown: (event: PointerEvent<SVGGElement>, nodeId: NodeId) => void;
}

function NodeViewBase({ node, selected, onPointerDown }: NodeViewProps) {
  const handlePointerDown = useCallback(
    (event: PointerEvent<SVGGElement>) => onPointerDown(event, node.id),
    [node.id, onPointerDown],
  );

  const bg = node.style?.bg ?? (node.kind === "text" ? "transparent" : "#ffffff");
  const border = node.style?.border ?? (node.kind === "text" ? "transparent" : "#1f2937");
  const fc = node.style?.fc ?? "#111827";
  const fs = node.style?.fs ?? (node.kind === "text" ? 13 : 12);
  const fw = node.style?.fw ?? (node.kind === "text" ? 500 : 600);
  const br = node.style?.br ?? 4;
  const bw = node.style?.bw ?? (node.kind === "text" ? 0 : 1.5);

  return (
    <g
      transform={`translate(${node.x},${node.y})`}
      className={`anchor-diagram-node${selected ? " is-selected" : ""}`}
      data-node-id={node.id}
      onPointerDown={handlePointerDown}
    >
      {node.kind !== "text" ? (
        <rect
          x={0}
          y={0}
          width={node.w}
          height={node.h}
          rx={br}
          ry={br}
          fill={bg}
          stroke={border}
          strokeWidth={bw}
        />
      ) : null}
      <foreignObject x={0} y={0} width={node.w} height={node.h} pointerEvents="none">
        <div
          className="anchor-diagram-node-label"
          style={{
            color: fc,
            fontSize: fs,
            fontWeight: fw,
            textAlign: node.style?.align ?? "center",
          }}
        >
          {node.title ?? ""}
        </div>
      </foreignObject>
      {selected ? (
        <rect
          x={-3}
          y={-3}
          width={node.w + 6}
          height={node.h + 6}
          rx={br + 2}
          ry={br + 2}
          fill="none"
          stroke="#2563eb"
          strokeWidth={1.5}
          strokeDasharray="4 3"
          pointerEvents="none"
        />
      ) : null}
    </g>
  );
}

export const NodeView = memo(NodeViewBase);
