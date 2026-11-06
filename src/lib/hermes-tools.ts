export interface HermesToolDef {
  name: string;
  description: string;
  parameters: {
    type: 'OBJECT' | 'object';
    properties: Record<string, any>;
    required?: string[];
  };
}

export const HERMES_TOOLS: HermesToolDef[] = [
  // Computer control (laptop only / CUA)
  {
    name: 'computer_screenshot',
    description: 'Take a screenshot of the laptop screen. Returns base64 PNG or image url.',
    parameters: {
      type: 'OBJECT',
      properties: { display: { type: 'STRING', description: 'Optional display identifier' } },
      required: [],
    },
  },
  {
    name: 'computer_click',
    description: 'Click at coordinates on the laptop screen.',
    parameters: {
      type: 'OBJECT',
      properties: {
        x: { type: 'NUMBER', description: 'X coordinate' },
        y: { type: 'NUMBER', description: 'Y coordinate' },
        button: { type: 'STRING', enum: ['left', 'right', 'middle'] },
      },
      required: ['x', 'y'],
    },
  },
  {
    name: 'computer_type',
    description: 'Type text on the laptop active window.',
    parameters: {
      type: 'OBJECT',
      properties: {
        text: { type: 'STRING', description: 'Text to type' },
      },
      required: ['text'],
    },
  },
  {
    name: 'computer_key',
    description: 'Press a key or key combination on the laptop.',
    parameters: {
      type: 'OBJECT',
      properties: {
        key: { type: 'STRING', description: 'Key name like Return, Escape, Tab, BackSpace' },
        modifiers: {
          type: 'ARRAY',
          items: { type: 'STRING' },
          description: 'Modifiers like ctrl, shift, alt, meta',
        },
      },
      required: ['key'],
    },
  },
  {
    name: 'computer_run',
    description: 'Run a shell command on the laptop and return stdout, stderr, and exit_code.',
    parameters: {
      type: 'OBJECT',
      properties: {
        command: { type: 'STRING', description: 'Command to run' },
        timeout_ms: { type: 'NUMBER', description: 'Timeout in milliseconds' },
      },
      required: ['command'],
    },
  },
  {
    name: 'computer_file_read',
    description: 'Read the contents of a file on the laptop.',
    parameters: {
      type: 'OBJECT',
      properties: {
        path: { type: 'STRING', description: 'File path to read' },
        offset: { type: 'NUMBER', description: 'Line or byte offset' },
        limit: { type: 'NUMBER', description: 'Max lines or bytes to read' },
      },
      required: ['path'],
    },
  },
  {
    name: 'computer_file_write',
    description: 'Write content to a file on the laptop.',
    parameters: {
      type: 'OBJECT',
      properties: {
        path: { type: 'STRING', description: 'Target file path' },
        content: { type: 'STRING', description: 'File content' },
      },
      required: ['path', 'content'],
    },
  },

  // Scheduling & tasks (both Hermes)
  {
    name: 'hermes_schedule_create',
    description: 'Create a scheduled cron task on Hermes.',
    parameters: {
      type: 'OBJECT',
      properties: {
        name: { type: 'STRING', description: 'Schedule name' },
        cron: { type: 'STRING', description: 'Cron expression, e.g. 0 3 * * *' },
        command: { type: 'STRING', description: 'Command or task to execute' },
        enabled: { type: 'BOOLEAN', description: 'Whether active immediately' },
      },
      required: ['name', 'cron', 'command'],
    },
  },
  {
    name: 'hermes_schedule_list',
    description: 'List all active and configured scheduled tasks on Hermes.',
    parameters: {
      type: 'OBJECT',
      properties: {},
      required: [],
    },
  },
  {
    name: 'hermes_schedule_delete',
    description: 'Delete a scheduled task by ID.',
    parameters: {
      type: 'OBJECT',
      properties: {
        id: { type: 'STRING', description: 'ID of schedule to remove' },
      },
      required: ['id'],
    },
  },

  // Task execution (both Hermes)
  {
    name: 'hermes_task_run',
    description: 'Run a named task or agentic workflow on Hermes.',
    parameters: {
      type: 'OBJECT',
      properties: {
        task_id: { type: 'STRING', description: 'Task or skill identifier' },
        params: { type: 'OBJECT', description: 'Execution parameters' },
      },
      required: ['task_id'],
    },
  },
  {
    name: 'hermes_task_status',
    description: 'Check the current status or logs of a running Hermes task.',
    parameters: {
      type: 'OBJECT',
      properties: {
        task_id: { type: 'STRING', description: 'Task identifier' },
      },
      required: ['task_id'],
    },
  },

  // Generic tool call (escape hatch)
  {
    name: 'hermes_tool_call',
    description: 'Call any tool from the 174 Hermes catalog by name.',
    parameters: {
      type: 'OBJECT',
      properties: {
        tool: { type: 'STRING', description: 'Exact tool name' },
        args: { type: 'OBJECT', description: 'Tool arguments' },
      },
      required: ['tool', 'args'],
    },
  },
];
