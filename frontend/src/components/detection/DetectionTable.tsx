import { ArrowDown, ArrowUp, ArrowUpDown, SearchX } from "lucide-react";
import { useMemo, useState } from "react";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import type { Detection } from "@/types/api";
import { classColor } from "@/utils/colors";

type SortKey = "confidence" | "class";

/** One row per detected object, sortable by confidence and filterable by class. */
export function DetectionTable({
  detections,
  highlighted,
  onHover,
}: {
  detections: Detection[];
  highlighted?: number | null;
  onHover?: (index: number | null) => void;
}) {
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({ key: "confidence", dir: "desc" });
  const [classFilter, setClassFilter] = useState<string>("all");

  const classes = useMemo(() => {
    const seen = new Map<number, string>();
    for (const d of detections) seen.set(d.class_id, d.class_name);
    return [...seen.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [detections]);

  const rows = useMemo(() => {
    const indexed = detections.map((det, index) => ({ det, index }));
    const filtered = classFilter === "all" ? indexed : indexed.filter(({ det }) => String(det.class_id) === classFilter);
    const factor = sort.dir === "asc" ? 1 : -1;
    return filtered.sort((a, b) =>
      sort.key === "confidence"
        ? (a.det.confidence - b.det.confidence) * factor
        : a.det.class_name.localeCompare(b.det.class_name) * factor || b.det.confidence - a.det.confidence,
    );
  }, [detections, sort, classFilter]);

  const toggleSort = (key: SortKey) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: key === "class" ? "asc" : "desc" }));

  const SortIcon = ({ k }: { k: SortKey }) =>
    sort.key !== k ? <ArrowUpDown className="size-3 opacity-50" /> : sort.dir === "asc" ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          Showing <span className="font-medium text-foreground">{rows.length}</span> of {detections.length} objects
        </p>
        <Select value={classFilter} onValueChange={setClassFilter}>
          <SelectTrigger className="h-8 w-44 text-xs" aria-label="Filter table by class">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All classes</SelectItem>
            {classes.map(([id, name]) => (
              <SelectItem key={id} value={String(id)}>
                {name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="overflow-hidden rounded-xl border">
        <Table>
          <TableHeader className="bg-background/40">
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-10">#</TableHead>
              <TableHead aria-sort={sort.key === "class" ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}>
                <button type="button" className="inline-flex items-center gap-1 uppercase hover:text-foreground" onClick={() => toggleSort("class")}>
                  Class <SortIcon k="class" />
                </button>
              </TableHead>
              <TableHead aria-sort={sort.key === "confidence" ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}>
                <button type="button" className="inline-flex items-center gap-1 uppercase hover:text-foreground" onClick={() => toggleSort("confidence")}>
                  Confidence <SortIcon k="confidence" />
                </button>
              </TableHead>
              <TableHead className="text-right">X</TableHead>
              <TableHead className="text-right">Y</TableHead>
              <TableHead className="text-right">Width</TableHead>
              <TableHead className="text-right">Height</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                  <SearchX className="mx-auto mb-2 size-5" aria-hidden />
                  No objects match this filter
                </TableCell>
              </TableRow>
            )}
            {rows.map(({ det, index }) => (
              <TableRow
                key={index}
                className={cn("tabular cursor-default", highlighted === index && "bg-accent/70")}
                onPointerEnter={onHover ? () => onHover(index) : undefined}
                onPointerLeave={onHover ? () => onHover(null) : undefined}
              >
                <TableCell className="text-muted-foreground">{index + 1}</TableCell>
                <TableCell>
                  <span className="flex items-center gap-2 font-medium">
                    <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: classColor(det.class_id) }} aria-hidden />
                    {det.class_name}
                  </span>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <span className="w-12 font-mono text-xs">{(det.confidence * 100).toFixed(1)}%</span>
                    <span className="hidden h-1.5 w-16 overflow-hidden rounded-full bg-elevated sm:block" aria-hidden>
                      <span className="block h-full rounded-full bg-primary" style={{ width: `${det.confidence * 100}%` }} />
                    </span>
                  </div>
                </TableCell>
                <TableCell className="text-right font-mono text-xs">{Math.round(det.bbox.x)}</TableCell>
                <TableCell className="text-right font-mono text-xs">{Math.round(det.bbox.y)}</TableCell>
                <TableCell className="text-right font-mono text-xs">{Math.round(det.bbox.width)}</TableCell>
                <TableCell className="text-right font-mono text-xs">{Math.round(det.bbox.height)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
