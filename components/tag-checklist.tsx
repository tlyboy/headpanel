'use client'

import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { tagLabel } from '@/lib/format'

export function TagChecklist({
  options,
  picked,
  onChange,
}: {
  options: string[]
  picked: string[]
  onChange: (next: string[]) => void
}) {
  return (
    <div className="flex flex-col gap-2">
      {options.map((tag) => (
        <Label key={tag} className="flex items-center gap-2 font-normal">
          <Checkbox
            checked={picked.includes(tag)}
            onCheckedChange={(on) =>
              onChange(on ? [...picked, tag] : picked.filter((x) => x !== tag))
            }
          />
          {tagLabel(tag)}
        </Label>
      ))}
    </div>
  )
}
