import { saveFieldValues } from "@/lib/actions/tasks";
import type { CustomField } from "@/lib/types";
import { ActionForm, SubmitButton } from "./form";
import { Field, Input, Select } from "./ui";

export function CustomFieldsForm({
  fields,
  values,
  taskId,
  orgSlug,
  canEdit,
}: {
  fields: CustomField[];
  values: Record<string, string | null>;
  taskId: string;
  orgSlug: string;
  canEdit: boolean;
}) {
  if (!canEdit) {
    return (
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
        {fields.map((f) => (
          <div key={f.id} className="contents">
            <dt className="text-muted">{f.name}</dt>
            <dd>{f.field_type === "checkbox" ? (values[f.id] === "true" ? "Yes" : "No") : (values[f.id] ?? "None")}</dd>
          </div>
        ))}
      </dl>
    );
  }
  return (
    <ActionForm action={saveFieldValues} className="grid gap-3 sm:grid-cols-2">
      <input type="hidden" name="task_id" value={taskId} />
      <input type="hidden" name="org_slug" value={orgSlug} />
      {fields.map((f) => {
        const name = `field:${f.id}`;
        const value = values[f.id] ?? "";
        if (f.field_type === "checkbox") {
          return (
            <label key={f.id} className="flex items-center gap-2 self-end pb-2 text-sm">
              <input type="hidden" name="checkbox_fields" value={f.id} />
              <input type="checkbox" name={name} value="true" defaultChecked={value === "true"} className="accent-[var(--brand)]" />
              {f.name}
            </label>
          );
        }
        return (
          <Field key={f.id} label={f.name}>
            {f.field_type === "select" ? (
              <Select name={name} defaultValue={value}>
                <option value="">None</option>
                {f.options.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </Select>
            ) : (
              <Input name={name} defaultValue={value} type={f.field_type === "number" ? "number" : f.field_type === "date" ? "date" : "text"} step="any" />
            )}
          </Field>
        );
      })}
      <div className="sm:col-span-2">
        <SubmitButton size="sm">Save fields</SubmitButton>
      </div>
    </ActionForm>
  );
}
