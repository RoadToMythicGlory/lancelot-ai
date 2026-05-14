import { Context } from '../types';
import { GraphicsProject, GraphicsExport } from '../models/graphics.models';
import { mxfExportService } from '../services/mxfExportService';
import { requireAuth } from '../middleware/auth';
import { Permission } from '../rbac';
import fs from 'fs/promises';
import path from 'path';

export const graphicsResolvers = {
  Query: {
    graphicsProjects: async (_: any, __: any, context: Context) => {
      requireAuth(context);
      
      return GraphicsProject.find({ createdBy: context.user!.userId })
        .sort({ updatedAt: -1 })
        .populate('createdBy', 'displayName email');
    },

    graphicsProject: async (_: any, { id }: any, context: Context) => {
      requireAuth(context);
      
      const project = await GraphicsProject.findById(id).populate('createdBy', 'displayName email');
      
      if (!project) {
        throw new Error('Project not found');
      }
      
      // Check if user owns the project or has admin access
      if (project.createdBy.toString() !== context.user!.userId && 
          !context.user!.has?.(Permission.MEDIA_MANAGE)) {
        throw new Error('Access denied');
      }
      
      return project;
    },

    graphicsExports: async (_: any, __: any, context: Context) => {
      requireAuth(context);
      
      return GraphicsExport.find({ createdBy: context.user!.userId })
        .sort({ createdAt: -1 })
        .populate('projectId', 'name')
        .populate('createdBy', 'displayName email');
    },

    graphicsTemplates: async () => {
      // Return available templates
      return [
        {
          id: 'lower_third',
          name: 'Lower Third',
          description: 'Standard lower third graphics for name and title',
          category: 'NEWS',
          previewUrl: '/templates/lower_third_preview.png'
        },
        {
          id: 'score_bug',
          name: 'Score Bug',
          description: 'Live sports score display',
          category: 'SPORTS',
          previewUrl: '/templates/score_bug_preview.png'
        },
        {
          id: 'breaking_news',
          name: 'Breaking News',
          description: 'Breaking news banner with headline',
          category: 'NEWS',
          previewUrl: '/templates/breaking_news_preview.png'
        },
        {
          id: 'weather_bug',
          name: 'Weather Bug',
          description: 'Current weather conditions display',
          category: 'WEATHER',
          previewUrl: '/templates/weather_bug_preview.png'
        },
        {
          id: 'election_results',
          name: 'Election Results',
          description: 'Live election results and vote counts',
          category: 'POLITICS',
          previewUrl: '/templates/election_results_preview.png'
        }
      ];
    }
  },

  Mutation: {
    createGraphicsProject: async (_: any, { input }: any, context: Context) => {
      requireAuth(context);

      const project = new GraphicsProject({
        ...input,
        createdBy: context.user!.userId,
        updatedBy: context.user!.userId,
        createdAt: new Date(),
        updatedAt: new Date()
      });

      return project.save();
    },

    updateGraphicsProject: async (_: any, { id, input }: any, context: Context) => {
      requireAuth(context);

      const project = await GraphicsProject.findById(id);
      
      if (!project) {
        throw new Error('Project not found');
      }
      
      if (project.createdBy.toString() !== context.user!.userId && 
          !context.user!.has?.(Permission.MEDIA_MANAGE)) {
        throw new Error('Access denied');
      }

      return GraphicsProject.findByIdAndUpdate(
        id,
        { 
          ...input, 
          updatedBy: context.user!.userId,
          updatedAt: new Date() 
        },
        { new: true }
      ).populate('createdBy', 'displayName email');
    },

    deleteGraphicsProject: async (_: any, { id }: any, context: Context) => {
      requireAuth(context);

      const project = await GraphicsProject.findById(id);
      
      if (!project) {
        throw new Error('Project not found');
      }
      
      if (project.createdBy.toString() !== context.user!.userId && 
          !context.user!.has?.(Permission.MEDIA_MANAGE)) {
        throw new Error('Access denied');
      }

      await GraphicsProject.findByIdAndDelete(id);
      return true;
    },

    exportGraphicsProject: async (_: any, { input }: any, context: Context) => {
      requireAuth(context);

      try {
        const { projectId, options } = input;
        
        const project = await GraphicsProject.findById(projectId);
        if (!project) {
          throw new Error('Project not found');
        }
        
        if (project.createdBy.toString() !== context.user!.userId && 
            !context.user!.has?.(Permission.MEDIA_MANAGE)) {
          throw new Error('Access denied');
        }

        // Create export record
        const exportRecord = new GraphicsExport({
          projectId,
          createdBy: context.user!.userId,
          status: 'PROCESSING',
          options,
          createdAt: new Date()
        });
        
        await exportRecord.save();

        // Start export process (async)
        setImmediate(async () => {
          try {
            const outputPath = await mxfExportService.exportProject(
              project.toObject() as any,
              options,
              async (progress) => {
                await GraphicsExport.findByIdAndUpdate(exportRecord._id, { progress });
              }
            );

            // Get file stats
            const stats = await fs.stat(outputPath);
            
            await GraphicsExport.findByIdAndUpdate(exportRecord._id, {
              status: 'COMPLETED',
              progress: 100,
              outputPath,
              fileSize: stats.size,
              completedAt: new Date()
            });

          } catch (error) {
            console.error('Export failed:', error);
            const errorMessage = error instanceof Error ? error.message : String(error);
            await GraphicsExport.findByIdAndUpdate(exportRecord._id, {
              status: 'FAILED',
              error: errorMessage,
              completedAt: new Date()
            });
          }
        });

        return exportRecord;

      } catch (error) {
        console.error('Export initiation failed:', error);
        const errorMessage = error instanceof Error ? error.message : String(error);
        throw new Error(`Export failed: ${errorMessage}`);
      }
    },

    generatePreview: async (_: any, { input }: any, context: Context) => {
      requireAuth(context);

      try {
        const project = await GraphicsProject.findById(input.projectId);
        if (!project) {
          throw new Error('Project not found');
        }

        const previewPath = await mxfExportService.generatePreview(project.toObject() as any);
        
        // Read the file and convert to base64 for immediate return
        const imageBuffer = await fs.readFile(previewPath);
        const base64Image = imageBuffer.toString('base64');
        
        return {
          success: true,
          previewUrl: `data:image/png;base64,${base64Image}`,
          message: 'Preview generated successfully'
        };

      } catch (error) {
        console.error('Preview generation failed:', error);
        const errorMessage = error instanceof Error ? error.message : String(error);
        return {
          success: false,
          message: `Preview generation failed: ${errorMessage}`
        };
      }
    },

    duplicateGraphicsProject: async (_: any, { id }: any, context: Context) => {
      requireAuth(context);

      const originalProject = await GraphicsProject.findById(id);
      
      if (!originalProject) {
        throw new Error('Project not found');
      }
      
      if (originalProject.createdBy.toString() !== context.user!.userId && 
          !context.user!.has?.(Permission.MEDIA_MANAGE)) {
        throw new Error('Access denied');
      }

      const duplicatedProject = new GraphicsProject({
        ...originalProject.toObject(),
        _id: undefined,
        name: `${originalProject.name} (Copy)`,
        createdBy: context.user!.userId,
        updatedBy: context.user!.userId,
        createdAt: new Date(),
        updatedAt: new Date()
      });

      return duplicatedProject.save();
    }
  }
};
