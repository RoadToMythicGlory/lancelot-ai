import { spawn } from 'child_process';
import fs from 'fs/promises';
import path from 'path';

interface GraphicsElement {
  id: string;
  type: 'text' | 'rectangle' | 'image' | 'logo';
  content?: string;
  x: number;
  y: number;
  width?: number;
  height?: number;
  fontSize?: number;
  fontFamily?: string;
  color?: string;
  opacity?: number;
  shadow?: boolean;
  animation?: string;
  borderRadius?: number;
  gradient?: boolean;
  maxWidth?: number;
}

interface GraphicsProject {
  id: string;
  name: string;
  template: string;
  elements: GraphicsElement[];
  width: number;
  height: number;
  duration: number;
  framerate: number;
}

interface ExportOptions {
  format: 'mxf' | 'mov' | 'mp4';
  codec: 'dnxhd' | 'prores' | 'h264';
  resolution: '1080p' | '4k';
  framerate: 25 | 50 | 29.97 | 59.94;
  duration: number;
  transparency: boolean;
}

export class MXFExportService {
  private readonly outputDir = path.join(process.cwd(), 'exports');
  private readonly tempDir = path.join(process.cwd(), 'temp');

  constructor() {
    this.ensureDirectories();
  }

  private async ensureDirectories() {
    try {
      await fs.mkdir(this.outputDir, { recursive: true });
      await fs.mkdir(this.tempDir, { recursive: true });
    } catch (error) {
      console.error('Error creating directories:', error);
    }
  }

  /**
   * Generate FFmpeg filter complex for graphics rendering
   */
  private generateFFmpegFilters(project: GraphicsProject, options: ExportOptions): string {
    const filters: string[] = [];
    let inputIndex = 0;

    // Base canvas
    const resolution = options.resolution === '4k' ? '3840x2160' : '1920x1080';
    filters.push(`color=black:size=${resolution}:duration=${options.duration}:rate=${options.framerate}[base]`);

    let currentLayer = '[base]';

    // Process each element
    project.elements.forEach((element, index) => {
      const layerName = `[layer${index}]`;
      
      switch (element.type) {
        case 'text':
          const fontsize = element.fontSize || 24;
          const fontcolor = element.color?.replace('#', '') || 'white';
          const fontfile = this.getFontPath(element.fontFamily || 'Arial');
          
          let textFilter = `drawtext=text='${element.content?.replace(/'/g, "\\'")}':`;
          textFilter += `x=${element.x}:y=${element.y}:`;
          textFilter += `fontsize=${fontsize}:`;
          textFilter += `fontcolor=${fontcolor}:`;
          textFilter += `fontfile='${fontfile}'`;
          
          if (element.shadow) {
            textFilter += `:shadowcolor=black:shadowx=2:shadowy=2`;
          }
          
          filters.push(`${currentLayer}${textFilter}${layerName}`);
          currentLayer = layerName;
          break;

        case 'rectangle':
          const width = element.width || 100;
          const height = element.height || 50;
          const color = element.color?.replace('#', '') || 'white';
          const opacity = element.opacity || 1;
          
          let rectFilter = `drawbox=x=${element.x}:y=${element.y}:`;
          rectFilter += `w=${width}:h=${height}:`;
          rectFilter += `color=${color}@${opacity}:`;
          rectFilter += `t=fill`;
          
          filters.push(`${currentLayer}${rectFilter}${layerName}`);
          currentLayer = layerName;
          break;

        case 'image':
        case 'logo':
          // For images, we'd overlay them
          const imageFilter = `overlay=${element.x}:${element.y}`;
          filters.push(`${currentLayer}[${inputIndex}]${imageFilter}${layerName}`);
          currentLayer = layerName;
          inputIndex++;
          break;
      }
    });

    return filters.join(';');
  }

  /**
   * Get system font path
   */
  private getFontPath(fontFamily: string): string {
    const fontMap: Record<string, string> = {
      'Arial': '/System/Library/Fonts/Arial.ttf',
      'Arial Black': '/System/Library/Fonts/Arial Black.ttf',
      'Impact': '/System/Library/Fonts/Impact.ttf',
      'Times New Roman': '/System/Library/Fonts/Times New Roman.ttf',
      'Helvetica': '/System/Library/Fonts/Helvetica.ttc'
    };

    return fontMap[fontFamily] || fontMap['Arial'];
  }

  /**
   * Export graphics project to MXF
   */
  async exportProject(
    project: GraphicsProject, 
    options: ExportOptions,
    onProgress?: (progress: number) => void
  ): Promise<string> {
    const outputFilename = `${project.name.replace(/\s+/g, '_')}_${Date.now()}.${options.format}`;
    const outputPath = path.join(this.outputDir, outputFilename);

    try {
      // Generate FFmpeg command
      const filterComplex = this.generateFFmpegFilters(project, options);
      
      const ffmpegArgs = [
        '-f', 'lavfi',
        '-i', filterComplex,
        '-t', options.duration.toString(),
        '-r', options.framerate.toString(),
        '-pix_fmt', options.transparency ? 'yuva420p' : 'yuv420p',
        ...this.getCodecArgs(options),
        '-y', // Overwrite output file
        outputPath
      ];

      console.log('FFmpeg command:', 'ffmpeg', ffmpegArgs.join(' '));

      return new Promise((resolve, reject) => {
        const ffmpeg = spawn('ffmpeg', ffmpegArgs);
        
        let progress = 0;
        const totalFrames = options.duration * options.framerate;

        ffmpeg.stderr.on('data', (data) => {
          const output = data.toString();
          console.log('FFmpeg output:', output);
          
          // Parse progress from FFmpeg output
          const frameMatch = output.match(/frame=\s*(\d+)/);
          if (frameMatch) {
            const currentFrame = parseInt(frameMatch[1]);
            progress = Math.min((currentFrame / totalFrames) * 100, 100);
            onProgress?.(Math.round(progress));
          }
        });

        ffmpeg.on('close', (code) => {
          if (code === 0) {
            console.log('Export completed successfully');
            resolve(outputPath);
          } else {
            reject(new Error(`FFmpeg exited with code ${code}`));
          }
        });

        ffmpeg.on('error', (error) => {
          console.error('FFmpeg error:', error);
          reject(error);
        });
      });

    } catch (error) {
      console.error('Export error:', error);
      throw error;
    }
  }

  /**
   * Get codec-specific arguments
   */
  private getCodecArgs(options: ExportOptions): string[] {
    switch (options.codec) {
      case 'dnxhd':
        return [
          '-c:v', 'dnxhd',
          '-profile:v', 'dnxhr_hq',
          '-pix_fmt', 'yuv422p'
        ];
      
      case 'prores':
        return [
          '-c:v', 'prores_ks',
          '-profile:v', '3', // ProRes 422 HQ
          '-pix_fmt', 'yuv422p10le'
        ];
      
      case 'h264':
      default:
        return [
          '-c:v', 'libx264',
          '-preset', 'fast',
          '-crf', '18'
        ];
    }
  }

  /**
   * Generate preview image
   */
  async generatePreview(project: GraphicsProject): Promise<string> {
    const previewFilename = `preview_${project.id}.png`;
    const previewPath = path.join(this.tempDir, previewFilename);

    const filterComplex = this.generateFFmpegFilters(project, {
      format: 'mxf',
      codec: 'h264',
      resolution: '1080p',
      framerate: 25,
      duration: 1,
      transparency: false
    });

    const ffmpegArgs = [
      '-f', 'lavfi',
      '-i', filterComplex,
      '-frames:v', '1',
      '-y',
      previewPath
    ];

    return new Promise((resolve, reject) => {
      const ffmpeg = spawn('ffmpeg', ffmpegArgs);
      
      ffmpeg.on('close', (code) => {
        if (code === 0) {
          resolve(previewPath);
        } else {
          reject(new Error(`Preview generation failed with code ${code}`));
        }
      });

      ffmpeg.on('error', reject);
    });
  }

  /**
   * Get list of exported files
   */
  async getExportedFiles(): Promise<Array<{ filename: string; path: string; size: number; created: Date }>> {
    try {
      const files = await fs.readdir(this.outputDir);
      const fileStats = await Promise.all(
        files.map(async (filename) => {
          const filePath = path.join(this.outputDir, filename);
          const stats = await fs.stat(filePath);
          return {
            filename,
            path: filePath,
            size: stats.size,
            created: stats.birthtime
          };
        })
      );
      
      return fileStats.sort((a, b) => b.created.getTime() - a.created.getTime());
    } catch (error) {
      console.error('Error getting exported files:', error);
      return [];
    }
  }

  /**
   * Clean up old exports
   */
  async cleanupOldExports(maxAge: number = 7 * 24 * 60 * 60 * 1000): Promise<void> {
    try {
      const files = await this.getExportedFiles();
      const now = new Date();
      
      for (const file of files) {
        if (now.getTime() - file.created.getTime() > maxAge) {
          await fs.unlink(file.path);
          console.log(`Cleaned up old export: ${file.filename}`);
        }
      }
    } catch (error) {
      console.error('Error cleaning up exports:', error);
    }
  }
}

export const mxfExportService = new MXFExportService();
