import { ArrowLeftRight, Clock, Maximize2, Search } from "lucide-react";

import type { RibbonToolsProps } from "./Ribbon";
import { RibbonButton, RibbonGroup, RibbonSeparator } from "./ribbonPrimitives";

export function RibbonTools({
  onFind,
  onHistory,
  onSpecialChars,
  onToggleFocus,
  onConvertView,
}: RibbonToolsProps) {
  return (
    <>
      <RibbonGroup labelKey="diagram.ribbon.group.find">
        <RibbonButton labelKey="diagram.tools.find" onClick={onFind} icon={<Search size={14} />} />
        <RibbonButton labelKey="diagram.tools.specialChars" onClick={onSpecialChars}>Ω</RibbonButton>
      </RibbonGroup>
      <RibbonSeparator />
      {onConvertView ? (
        <>
          <RibbonGroup labelKey="diagram.ribbon.convertView">
            <RibbonButton
              labelKey="diagram.ribbon.convertView"
              onClick={onConvertView}
              icon={<ArrowLeftRight size={14} />}
            />
          </RibbonGroup>
          <RibbonSeparator />
        </>
      ) : null}
      <RibbonGroup labelKey="diagram.ribbon.group.history">
        <RibbonButton
          labelKey="diagram.tools.history"
          onClick={onHistory}
          icon={<Clock size={14} />}
        />
      </RibbonGroup>
      <RibbonSeparator />
      <RibbonGroup labelKey="diagram.ribbon.group.focus">
        <RibbonButton
          labelKey="diagram.tools.focus"
          onClick={onToggleFocus}
          icon={<Maximize2 size={14} />}
        />
      </RibbonGroup>
    </>
  );
}
