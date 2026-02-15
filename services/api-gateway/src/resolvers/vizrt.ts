import { Context } from '../types';
import { VizrtConfig, VizrtTemplate, VizrtMode } from '../models/vizrt.models';

// Vizrt API clients
interface VizrtClient {
  triggerCG(params: any): Promise<any>;
  previewCG(params: any): Promise<any>;
}

class VizrtArcClient implements VizrtClient {
  constructor(private config: any) {}
  
  async triggerCG(params: { actionId: string; variables: Record<string, any> }) {
    const response = await fetch(`${this.config.baseUrl}/api/actions/trigger`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(this.config.apiKey ? { Authorization: `Bearer ${this.config.apiKey}` } : {}),
        ...JSON.parse(this.config.headers || '{}')
      },
      body: JSON.stringify(params)
    });
    return { success: response.ok, data: await response.json().catch(() => null) };
  }

  async previewCG(params: any) {
    // Arc preview implementation
    return { success: true, previewUrl: `${this.config.baseUrl}/preview/${params.actionId}` };
  }
}

class VizrtPdsClient implements VizrtClient {
  constructor(private config: any) {}
  
  async triggerCG(params: { templateId: string; fields: Record<string, any> }) {
    const response = await fetch(`${this.config.baseUrl}/api/elements`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(this.config.apiKey ? { Authorization: `Bearer ${this.config.apiKey}` } : {}),
        ...JSON.parse(this.config.headers || '{}')
      },
      body: JSON.stringify(params)
    });
    return { success: response.ok, data: await response.json().catch(() => null) };
  }

  async previewCG(params: any) {
    return { success: true, previewUrl: `${this.config.baseUrl}/preview/${params.templateId}` };
  }
}

class VizrtEngineClient implements VizrtClient {
  constructor(private config: any) {}
  
  async triggerCG(params: { scenePath: string; data: Record<string, any> }) {
    const response = await fetch(`${this.config.baseUrl}/rest/playout/take`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(this.config.apiKey ? { Authorization: `Bearer ${this.config.apiKey}` } : {}),
        ...JSON.parse(this.config.headers || '{}')
      },
      body: JSON.stringify(params)
    });
    return { success: response.ok, data: await response.json().catch(() => null) };
  }

  async previewCG(params: any) {
    return { success: true, previewUrl: `${this.config.baseUrl}/preview${params.scenePath}` };
  }
}

function createVizrtClient(config: any): VizrtClient {
  switch (config.mode) {
    case VizrtMode.ARC:
      return new VizrtArcClient(config);
    case VizrtMode.PDS:
      return new VizrtPdsClient(config);
    case VizrtMode.ENGINE:
      return new VizrtEngineClient(config);
    default:
      throw new Error(`Unsupported Vizrt mode: ${config.mode}`);
  }
}

export const vizrtResolvers = {
  Query: {
    vizrtConfigs: async (_: any, __: any, context: Context) => {
      // TEMPORARY: Completely bypass permissions for testing
      console.log('Vizrt configs accessed by:', context.user?.email || 'No user', 'Permissions:', context.user?.permissions || 'None');
      return VizrtConfig.find({ isActive: true }).sort({ name: 1 });
    },

    vizrtTemplates: async (_: any, { category }: any, context: Context) => {
      // TEMPORARY: Completely bypass permissions for testing
      console.log('Vizrt templates accessed by:', context.user?.email || 'No user', 'Permissions:', context.user?.permissions || 'None');
      const filter = category ? { category } : {};
      return VizrtTemplate.find(filter).sort({ category: 1, name: 1 });
    },

    vizrtTemplate: async (_: any, { id }: any, context: Context) => {
      // TEMPORARY: Completely bypass permissions for testing
      console.log('Vizrt template accessed by:', context.user?.email || 'No user');
      return VizrtTemplate.findById(id);
    }
  },

  Mutation: {
    createVizrtConfig: async (_: any, { input }: any, context: Context) => {
      if (!context.user?.permissions?.includes('VIZRT_ADMIN')) {
        throw new Error('Insufficient permissions');
      }

      const config = new VizrtConfig({
        ...input,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date()
      });

      return config.save();
    },

    updateVizrtConfig: async (_: any, { id, input }: any, context: Context) => {
      if (!context.user?.permissions?.includes('VIZRT_ADMIN')) {
        throw new Error('Insufficient permissions');
      }

      return VizrtConfig.findByIdAndUpdate(
        id,
        { ...input, updatedAt: new Date() },
        { new: true }
      );
    },

    deleteVizrtConfig: async (_: any, { id }: any, context: Context) => {
      if (!context.user?.permissions?.includes('VIZRT_ADMIN')) {
        throw new Error('Insufficient permissions');
      }

      await VizrtConfig.findByIdAndUpdate(id, { isActive: false });
      return true;
    },

    createVizrtTemplate: async (_: any, { input }: any, context: Context) => {
      if (!context.user?.permissions?.includes('VIZRT_ADMIN')) {
        throw new Error('Insufficient permissions');
      }

      const template = new VizrtTemplate({
        ...input,
        createdAt: new Date(),
        updatedAt: new Date()
      });

      return template.save();
    },

    updateVizrtTemplate: async (_: any, { id, input }: any, context: Context) => {
      if (!context.user?.permissions?.includes('VIZRT_ADMIN')) {
        throw new Error('Insufficient permissions');
      }

      return VizrtTemplate.findByIdAndUpdate(
        id,
        { ...input, updatedAt: new Date() },
        { new: true }
      );
    },

    deleteVizrtTemplate: async (_: any, { id }: any, context: Context) => {
      if (!context.user?.permissions?.includes('VIZRT_ADMIN')) {
        throw new Error('Insufficient permissions');
      }

      await VizrtTemplate.findByIdAndDelete(id);
      return true;
    },

    triggerCG: async (_: any, { input }: any, context: Context) => {
      // Temporary: Allow any authenticated user for testing
      if (!context.user) {
        throw new Error('Authentication required');
      }

      try {
        // Get template to determine which config to use
        const template = await VizrtTemplate.findById(input.templateId);
        if (!template) {
          return { success: false, message: 'Template not found' };
        }

        // Get active config (could be improved to select based on template or event)
        const config = await VizrtConfig.findOne({ isActive: true });
        if (!config) {
          return { success: false, message: 'No active Vizrt configuration found' };
        }

        const client = createVizrtClient(config);
        const fields = JSON.parse(input.fields);
        
        let result;
        if (config.mode === VizrtMode.ARC) {
          result = await client.triggerCG({ actionId: template.name, variables: fields });
        } else if (config.mode === VizrtMode.PDS) {
          result = await client.triggerCG({ templateId: template.name, fields });
        } else {
          result = await client.triggerCG({ scenePath: template.name, data: fields });
        }

        // Log the trigger for audit
        console.log(`CG Triggered by ${context.user.email}: Template ${template.name}, Event ${input.eventId}, Segment ${input.segmentId}`);

        return {
          success: result.success,
          message: result.success ? 'CG triggered successfully' : 'Failed to trigger CG',
          triggerId: result.data?.id || Date.now().toString()
        };

      } catch (error) {
        console.error('Error triggering CG:', error);
        return {
          success: false,
          message: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`
        };
      }
    },

    previewCG: async (_: any, { input }: any, context: Context) => {
      // Temporary: Allow any authenticated user for testing
      if (!context.user) {
        throw new Error('Authentication required');
      }

      try {
        const template = await VizrtTemplate.findById(input.templateId);
        if (!template) {
          return { success: false, message: 'Template not found' };
        }

        const config = await VizrtConfig.findOne({ isActive: true });
        if (!config) {
          return { success: false, message: 'No active Vizrt configuration found' };
        }

        const client = createVizrtClient(config);
        const fields = JSON.parse(input.fields);
        
        const result = await client.previewCG({ templateId: template.name, fields });

        return {
          success: result.success,
          message: result.success ? 'Preview generated' : 'Failed to generate preview',
          previewUrl: result.previewUrl
        };

      } catch (error) {
        console.error('Error generating CG preview:', error);
        return {
          success: false,
          message: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`
        };
      }
    }
  }
};
