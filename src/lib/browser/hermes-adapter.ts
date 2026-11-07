import { DatabaseSync } from 'node:sqlite';
import { executeTool, UNIFIED_TOOLS } from '../tools';
import { getOrCreateBrowserSession, getBrowserSession } from './session';
import { getBrowserManager } from '../../server/browser-manager';

export interface HermesToolCall {
  name: string;
  arguments: Record<string, any>;
  callId?: string;
  runId?: string;
}

export interface HermesToolResult {
  tool: string;
  success: boolean;
  result?: any;
  error?: string;
  pane?: any;
  mood?: string;
  sessionId?: string;
}

export interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, any>;
    required?: string[];
  };
}

/**
 * Additive Hermes Tool Adapter for Sofia Browser Workspace.
 * Exposes the 12 browser tools to Hermes via standard Tool/MCP protocol,
 * targeting the active Sofia user browser session and updating the Stage in real time.
 */
export class HermesBrowserToolAdapter {
  private db: DatabaseSync;
  private defaultConversationId: string;

  constructor(db: DatabaseSync, defaultConversationId: string = 'conv_main') {
    this.db = db;
    this.defaultConversationId = defaultConversationId;
  }

  /**
   * Returns list of tools formatted for MCP / Hermes tool discovery.
   */
  public listTools(): McpToolDefinition[] {
    const browserToolNames = new Set([
      'browser_open',
      'browser_navigate',
      'browser_back',
      'browser_forward',
      'browser_click',
      'browser_type',
      'browser_scroll',
      'browser_press_key',
      'browser_wait',
      'browser_get_page_info',
      'browser_get_snapshot',
      'browser_screenshot',
    ]);

    return UNIFIED_TOOLS.filter((t) => browserToolNames.has(t.name)).map((t: any) => ({
      name: t.name,
      description: t.description,
      inputSchema: {
        type: 'object',
        properties: t.openaiParameters?.properties || t.parameters?.properties || {},
        required: t.openaiParameters?.required || t.parameters?.required || [],
      },
    }));
  }

  /**
   * Executes a tool invoked by Hermes, ensuring it binds to the active user session.
   */
  public async executeHermesTool(
    toolCall: HermesToolCall,
    context?: { conversationId?: string; userId?: string }
  ): Promise<HermesToolResult> {
    const convId = context?.conversationId || toolCall.arguments.conversationId || this.defaultConversationId;
    const session = toolCall.arguments.sessionId
      ? getBrowserSession(this.db, toolCall.arguments.sessionId)
      : getOrCreateBrowserSession(this.db, convId, context?.userId || 'owner');

    const mergedArgs = {
      ...toolCall.arguments,
      conversationId: convId,
      sessionId: session?.id || toolCall.arguments.sessionId,
      runId: toolCall.runId,
    };

    try {
      const toolRes = await executeTool(
        this.db,
        toolCall.name,
        mergedArgs,
        {
          headers: new Headers(),
          user: { id: context?.userId || 'owner' },
        } as any
      );

      if (toolRes.error && toolRes.result?.blocked) {
        return {
          tool: toolCall.name,
          success: false,
          error: toolRes.error,
          result: toolRes.result,
          pane: toolRes.pane,
          mood: toolRes.mood,
          sessionId: session?.id,
        };
      }

      return {
        tool: toolCall.name,
        success: !toolRes.error,
        result: toolRes.result,
        error: toolRes.error,
        pane: toolRes.pane,
        mood: toolRes.mood,
        sessionId: session?.id,
      };
    } catch (err: any) {
      return {
        tool: toolCall.name,
        success: false,
        error: err.message,
        sessionId: session?.id,
      };
    }
  }

  /**
   * JSON-RPC 2.0 Handler for standard MCP server integrations.
   */
  public async handleJsonRpc(request: {
    jsonrpc: string;
    id: string | number;
    method: string;
    params?: any;
  }): Promise<{ jsonrpc: string; id: string | number; result?: any; error?: any }> {
    if (request.method === 'initialize') {
      return {
        jsonrpc: '2.0',
        id: request.id,
        result: {
          protocolVersion: '2024-11-05',
          capabilities: { tools: {} },
          serverInfo: { name: 'sofia-browser', version: '1.0.0' },
        },
      };
    }

    if (request.method === 'notifications/initialized') {
      return { jsonrpc: '2.0', id: request.id, result: {} };
    }

    if (request.method === 'ping') {
      return { jsonrpc: '2.0', id: request.id, result: {} };
    }

    if (request.method === 'tools/list') {
      return {
        jsonrpc: '2.0',
        id: request.id,
        result: { tools: this.listTools() },
      };
    }

    if (request.method === 'tools/call') {
      const { name, arguments: toolArgs } = request.params || {};
      const execResult = await this.executeHermesTool({
        name,
        arguments: toolArgs || {},
      });

      return {
        jsonrpc: '2.0',
        id: request.id,
        result: {
          content: [
            {
              type: 'text',
              text: typeof execResult.result === 'string' ? execResult.result : JSON.stringify(execResult.result),
            },
          ],
          isError: !execResult.success,
          pane: execResult.pane,
          sessionId: execResult.sessionId,
        },
      };
    }

    return {
      jsonrpc: '2.0',
      id: request.id,
      error: { code: -32601, message: `Method not found: ${request.method}` },
    };
  }
}
