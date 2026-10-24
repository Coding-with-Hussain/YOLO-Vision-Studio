import { Check, Filter, Search, X } from "lucide-react";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { classColor } from "@/utils/colors";

/**
 * Multi-select over the loaded model's real class names. ``value === null``
 * means every class is included.
 */
export function ClassFilter({
  classNames,
  value,
  onChange,
  disabled,
  label = "Classes",
}: {
  classNames: string[];
  value: number[] | null;
  onChange: (value: number[] | null) => void;
  disabled?: boolean;
  label?: string;
}) {
  const [query, setQuery] = useState("");
  const selected = useMemo(() => new Set(value ?? []), [value]);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return classNames
      .map((name, id) => ({ name, id }))
      .filter((c) => !q || c.name.toLowerCase().includes(q) || String(c.id) === q);
  }, [classNames, query]);

  const toggle = (id: number) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange(next.size === 0 ? null : [...next].sort((a, b) => a - b));
  };

  const summary =
    value == null || value.length === 0
      ? `All ${classNames.length || ""} classes`.replace("  ", " ")
      : value.length === 1
        ? classNames[value[0]] ?? `Class ${value[0]}`
        : `${value.length} of ${classNames.length} classes`;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="secondary"
          className="w-full justify-between font-normal"
          disabled={disabled || classNames.length === 0}
          aria-label={`${label}: ${summary}`}
        >
          <span className="flex min-w-0 items-center gap-2">
            <Filter className="text-muted-foreground" />
            <span className="truncate">{classNames.length ? summary : "Load a model to filter classes"}</span>
          </span>
          {value && value.length > 0 && (
            <span className="rounded-full bg-primary/15 px-1.5 text-xs text-primary">{value.length}</span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[min(20rem,calc(100vw-2rem))] p-0">
        <div className="flex items-center gap-2 border-b p-2">
          <Search className="ml-1 size-4 shrink-0 text-muted-foreground" aria-hidden />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search classes…"
            className="h-8 border-0 bg-transparent px-0 focus-visible:ring-0"
            aria-label="Search classes"
          />
        </div>
        <div className="max-h-64 overflow-y-auto p-1" role="listbox" aria-multiselectable>
          {filtered.length === 0 && <p className="px-3 py-6 text-center text-sm text-muted-foreground">No matching classes</p>}
          {filtered.map((c) => {
            const isSelected = selected.has(c.id);
            return (
              <button
                key={c.id}
                type="button"
                role="option"
                aria-selected={isSelected}
                onClick={() => toggle(c.id)}
                className={cn(
                  "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-sm transition-colors hover:bg-accent",
                  isSelected && "bg-accent/60",
                )}
              >
                <span
                  className={cn(
                    "flex size-4 shrink-0 items-center justify-center rounded border",
                    isSelected ? "border-primary bg-primary text-primary-foreground" : "border-input",
                  )}
                >
                  {isSelected && <Check className="size-3" />}
                </span>
                <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: classColor(c.id) }} aria-hidden />
                <span className="min-w-0 flex-1 truncate">{c.name}</span>
                <span className="font-mono text-[11px] text-muted-foreground">{c.id}</span>
              </button>
            );
          })}
        </div>
        <div className="flex items-center justify-between border-t p-2">
          <span className="px-1 text-xs text-muted-foreground">
            {value?.length ? `${value.length} selected` : "No filter: all classes"}
          </span>
          <Button type="button" variant="ghost" size="sm" onClick={() => onChange(null)} disabled={!value?.length}>
            <X /> Clear
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
