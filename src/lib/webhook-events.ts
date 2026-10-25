// Webhook event names are "<entity>.<action>" from the activity feed.
export const WEBHOOK_EVENTS: [string, string][] = [
  ["*", "Everything"],
  ["task.*", "Any task event"],
  ["task.created", "Task created"],
  ["task.status", "Task status changed"],
  ["task.approved", "Task approved by client"],
  ["bug.*", "Any bug event"],
  ["comment.commented", "Comment posted"],
  ["file.uploaded", "File uploaded"],
  ["member.member_added", "Person added to project"],
  ["document.*", "Pages created or edited"],
  ["topic.topic", "Discussion started"],
  ["invoice.*", "Invoice sent, paid or voided"],
];
