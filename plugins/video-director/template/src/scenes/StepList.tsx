import React from "react";
import { useCurrentFrame, useVideoConfig } from "remotion";
import { Icon, Mark } from "../components/primitives";
import { StageFrame } from "../components/Stage";
import { arrive, ease, lerp, tween } from "../motion";
import { stepList } from "../lib/layout.mjs";
import { useBeat, useShot } from "../shot";

export type StepItem = { text: string; icon?: string; at: string; done?: boolean };
export type StepListProps = { items: StepItem[]; ordered?: boolean; title?: string };

/**
 * Numbered steps or a checklist (catalogue 2.7). At most 5 items.
 *
 * The title and the list are one block, centred in the stage both ways, and
 * the type is larger with 1-3 items. Before, the list hung from the top left
 * at a fixed size and left about two thirds of the frame empty in test videos
 * that were not incidents. Items not yet reached keep their place (invisible),
 * so the block never moves while the list builds.
 */
export const StepList: React.FC = () => {
  const { shot, c, L } = useShot();
  const beat = useBeat();
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const props = shot.props as StepListProps;
  const items = (props.items ?? []).slice(0, 5);
  const ordered = props.ordered !== false;
  // The text shrinks so the longest item stays on one line, and wraps to two
  // lines at the 28 px minimum (lib/layout.mjs).
  const { few, disc, gap, tick: tickSize, textSize, room, wrap } = stepList(L, items);
  const rowH = few ? 150 : 120;
  const titleSize = L.narrow ? (few ? 68 : 56) : few ? 80 : 64;
  const ats = items.map((it) => beat(it.at));
  const current = ats.filter((a) => frame >= a).length - 1;
  // The title is on screen from the first frame: the incoming transition
  // shows it instead of an empty stage.
  const titleIn = tween(frame, 0, Math.round(0.3 * fps));

  // The rail draws down to the newest item.
  const railTo =
    current < 0
      ? 0
      : lerp(
          Math.max(0, current - 1),
          current,
          tween(frame, ats[current] - Math.round(0.3 * fps), ats[current], ease.inOut),
        ) * rowH;

  return (
    <StageFrame>
      <div
        style={{
          position: "absolute",
          left: L.textMargin,
          right: L.textMargin,
          top: L.stageTop,
          bottom: L.height - L.stageBottom,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start" }}>
          {props.title ? (
            <div style={{ fontSize: titleSize, fontWeight: 700, lineHeight: 1.15, marginBottom: few ? 56 : 36, opacity: titleIn }}>
              {props.title}
            </div>
          ) : null}
          <div style={{ position: "relative" }}>
            {ordered && items.length > 1 ? (
              <div
                style={{
                  position: "absolute",
                  left: disc / 2 - 2,
                  top: disc / 2,
                  width: 4,
                  height: railTo,
                  backgroundColor: c.hairline,
                  borderRadius: 2,
                }}
              />
            ) : null}
            {items.map((it, i) => {
              const p = arrive(frame, ats[i], fps, 0.35);
              const isCurrent = i === current;
              return (
                <div
                  key={i}
                  style={{
                    position: "relative",
                    // The last row ends at its disc, so the block is centred on what is drawn
                    height: i === items.length - 1 ? disc : rowH,
                    display: "flex",
                    alignItems: "flex-start",
                    gap,
                    opacity: Math.max(0, p),
                    transform: `translateX(${lerp(-28, 0, p)}px)`,
                  }}
                >
                  <div
                    style={{
                      width: disc,
                      height: disc,
                      flexShrink: 0,
                      borderRadius: disc / 2,
                      boxSizing: "border-box",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      backgroundColor: c.card,
                      border: `4px solid ${isCurrent ? c.accent : c.hairline}`,
                      fontSize: Math.round(disc * 0.45),
                      fontWeight: 700,
                      color: isCurrent ? c.accent : c.muted,
                    }}
                  >
                    {it.icon ? (
                      <Icon name={it.icon} size={Math.round(disc * 0.52)} color={isCurrent ? c.accent : c.muted} />
                    ) : ordered ? (
                      i + 1
                    ) : null}
                  </div>
                  <div
                    style={{
                      height: disc,
                      display: "flex",
                      alignItems: "center",
                      // At the 28 px minimum a long item wraps to two lines
                      whiteSpace: wrap ? "normal" : "nowrap",
                      maxWidth: room,
                      lineHeight: 1.15,
                      fontSize: textSize,
                      fontWeight: isCurrent ? 600 : 400,
                      color: isCurrent ? c.ink : c.muted,
                    }}
                  >
                    {it.text}
                  </div>
                  {it.done ? (
                    <div style={{ height: disc, display: "flex", alignItems: "center" }}>
                      <Mark kind="tick" at={ats[i] + Math.round(0.3 * fps)} size={tickSize} color={c.positive} />
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </StageFrame>
  );
};
