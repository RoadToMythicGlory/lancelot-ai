'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { 
  Card, 
  Button, 
  Input, 
  Select, 
  ColorPicker, 
  Slider, 
  Upload, 
  Space, 
  Row, 
  Col,
  Tabs,
  message,
  Modal,
  Progress,
  Divider,
  Typography,
  Tooltip
} from 'antd';
import { 
  PlayCircleOutlined,
  DownloadOutlined,
  SaveOutlined,
  PlusOutlined,
  EyeOutlined,
  FileImageOutlined,
  FontSizeOutlined,
  BgColorsOutlined,
  ExportOutlined,
  VideoCameraOutlined
} from '@ant-design/icons';

const { Option } = Select;
const { Text, Title } = Typography;

// Graphics Templates
const GRAPHICS_TEMPLATES = {
  lower_third: {
    name: 'Lower Third',
    width: 1920,
    height: 1080,
    elements: [
      {
        id: 'main_text',
        type: 'text',
        content: 'JOHN SMITH',
        x: 100,
        y: 850,
        fontSize: 48,
        fontFamily: 'Arial Black',
        color: '#FFFFFF',
        shadow: true
      },
      {
        id: 'subtitle',
        type: 'text', 
        content: 'Sports Reporter',
        x: 100,
        y: 920,
        fontSize: 32,
        fontFamily: 'Arial',
        color: '#E0E0E0',
        shadow: true
      },
      {
        id: 'background',
        type: 'rectangle',
        x: 0,
        y: 820,
        width: 800,
        height: 200,
        color: '#1a237e',
        opacity: 0.8,
        gradient: true
      }
    ]
  },
  score_bug: {
    name: 'Score Bug',
    width: 1920,
    height: 1080,
    elements: [
      {
        id: 'home_team',
        type: 'text',
        content: 'HOME',
        x: 50,
        y: 50,
        fontSize: 24,
        fontFamily: 'Arial Bold',
        color: '#FFFFFF'
      },
      {
        id: 'home_score',
        type: 'text',
        content: '0',
        x: 150,
        y: 50,
        fontSize: 32,
        fontFamily: 'Arial Black',
        color: '#00FF00'
      },
      {
        id: 'away_team',
        type: 'text',
        content: 'AWAY',
        x: 50,
        y: 90,
        fontSize: 24,
        fontFamily: 'Arial Bold',
        color: '#FFFFFF'
      },
      {
        id: 'away_score',
        type: 'text',
        content: '0',
        x: 150,
        y: 90,
        fontSize: 32,
        fontFamily: 'Arial Black',
        color: '#FF0000'
      },
      {
        id: 'background',
        type: 'rectangle',
        x: 30,
        y: 30,
        width: 200,
        height: 100,
        color: '#000000',
        opacity: 0.7,
        borderRadius: 10
      }
    ]
  },
  breaking_news: {
    name: 'Breaking News',
    width: 1920,
    height: 1080,
    elements: [
      {
        id: 'breaking_text',
        type: 'text',
        content: 'BREAKING NEWS',
        x: 100,
        y: 100,
        fontSize: 64,
        fontFamily: 'Impact',
        color: '#FF0000',
        animation: 'pulse'
      },
      {
        id: 'news_content',
        type: 'text',
        content: 'Major story developing...',
        x: 100,
        y: 200,
        fontSize: 36,
        fontFamily: 'Arial',
        color: '#FFFFFF',
        maxWidth: 1200
      },
      {
        id: 'red_bar',
        type: 'rectangle',
        x: 0,
        y: 80,
        width: 1920,
        height: 20,
        color: '#FF0000'
      }
    ]
  }
};

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
  duration: number; // seconds
  createdAt: string;
  updatedAt: string;
}

export default function GraphicsCreator() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [currentProject, setCurrentProject] = useState<GraphicsProject | null>(null);
  const [selectedElement, setSelectedElement] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [exportModalVisible, setExportModalVisible] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  // Initialize with lower third template
  useEffect(() => {
    if (!currentProject) {
      loadTemplate('lower_third');
    }
  }, []);

  const loadTemplate = (templateKey: string) => {
    const template = GRAPHICS_TEMPLATES[templateKey as keyof typeof GRAPHICS_TEMPLATES];
    if (template) {
      const project: GraphicsProject = {
        id: Date.now().toString(),
        name: `${template.name} Project`,
        template: templateKey,
        elements: [...(template.elements as GraphicsElement[])],
        width: template.width,
        height: template.height,
        duration: 10,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      setCurrentProject(project);
      setSelectedElement(null);
      renderCanvas(project);
    }
  };

  const renderCanvas = useCallback((project: GraphicsProject) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas size
    canvas.width = project.width / 2; // Scale down for preview
    canvas.height = project.height / 2;

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Scale context for preview
    ctx.scale(0.5, 0.5);

    // Render elements
    project.elements.forEach(element => {
      ctx.save();
      
      if (element.opacity) {
        ctx.globalAlpha = element.opacity;
      }

      switch (element.type) {
        case 'rectangle':
          if (element.gradient && element.color) {
            const gradient = ctx.createLinearGradient(element.x, element.y, element.x + (element.width || 100), element.y);
            gradient.addColorStop(0, element.color);
            gradient.addColorStop(1, element.color + '80'); // Add transparency
            ctx.fillStyle = gradient;
          } else {
            ctx.fillStyle = element.color || '#FFFFFF';
          }
          
          if (element.borderRadius) {
            ctx.beginPath();
            ctx.roundRect(element.x, element.y, element.width || 100, element.height || 50, element.borderRadius);
            ctx.fill();
          } else {
            ctx.fillRect(element.x, element.y, element.width || 100, element.height || 50);
          }
          break;

        case 'text':
          ctx.fillStyle = element.color || '#FFFFFF';
          ctx.font = `${element.fontSize || 24}px ${element.fontFamily || 'Arial'}`;
          
          if (element.shadow) {
            ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
            ctx.shadowBlur = 4;
            ctx.shadowOffsetX = 2;
            ctx.shadowOffsetY = 2;
          }
          
          if (element.maxWidth) {
            // Word wrap for long text
            const words = (element.content || '').split(' ');
            let line = '';
            let y = element.y;
            
            for (let n = 0; n < words.length; n++) {
              const testLine = line + words[n] + ' ';
              const metrics = ctx.measureText(testLine);
              const testWidth = metrics.width;
              
              if (testWidth > element.maxWidth && n > 0) {
                ctx.fillText(line, element.x, y);
                line = words[n] + ' ';
                y += (element.fontSize || 24) * 1.2;
              } else {
                line = testLine;
              }
            }
            ctx.fillText(line, element.x, y);
          } else {
            ctx.fillText(element.content || '', element.x, element.y);
          }
          break;
      }
      
      ctx.restore();
    });

    // Reset scale
    ctx.setTransform(1, 0, 0, 1, 0, 0);

    // Generate preview URL
    const dataUrl = canvas.toDataURL('image/png');
    setPreviewUrl(dataUrl);
  }, []);

  useEffect(() => {
    if (currentProject) {
      renderCanvas(currentProject);
    }
  }, [currentProject, renderCanvas]);

  const updateElement = (elementId: string, updates: Partial<GraphicsElement>) => {
    if (!currentProject) return;

    const updatedProject = {
      ...currentProject,
      elements: currentProject.elements.map(el => 
        el.id === elementId ? { ...el, ...updates } : el
      ),
      updatedAt: new Date().toISOString()
    };
    
    setCurrentProject(updatedProject);
  };

  const exportToMXF = async () => {
    if (!currentProject) {
      message.error('No project to export');
      return;
    }

    setExportModalVisible(true);
    setExportProgress(0);

    try {
      // Simulate export process
      for (let i = 0; i <= 100; i += 10) {
        await new Promise(resolve => setTimeout(resolve, 200));
        setExportProgress(i);
      }

      // In a real implementation, this would:
      // 1. Render the graphics at full resolution
      // 2. Create video frames for the duration
      // 3. Encode to MXF format
      // 4. Save the file

      const canvas = canvasRef.current;
      if (canvas) {
        // Create download link for PNG (placeholder for MXF)
        const link = document.createElement('a');
        link.download = `${currentProject.name.replace(/\s+/g, '_')}.png`;
        link.href = canvas.toDataURL();
        link.click();
      }

      message.success('Graphics exported successfully!');
      setExportModalVisible(false);

    } catch (error) {
      message.error('Export failed');
      setExportModalVisible(false);
    }
  };

  const selectedElementData = currentProject?.elements.find(el => el.id === selectedElement);

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b bg-gray-50">
        <div>
          <Title level={4} className="mb-0">Graphics Creator</Title>
          <Text type="secondary">{currentProject?.name || 'No project loaded'}</Text>
        </div>
        <Space>
          <Button icon={<SaveOutlined />}>Save Project</Button>
          <Button 
            type="primary" 
            icon={<ExportOutlined />}
            onClick={exportToMXF}
            disabled={!currentProject}
          >
            Export MXF
          </Button>
        </Space>
      </div>

      <div className="flex-1 flex">
        {/* Left Panel - Templates & Elements */}
        <div className="w-80 border-r bg-gray-50 p-4 overflow-y-auto">
          <Tabs
            size="small"
            items={[
              {
                key: 'templates',
                label: 'Templates',
                children: (
                  <div className="space-y-3">
                    {Object.entries(GRAPHICS_TEMPLATES).map(([key, template]) => (
                      <Card 
                        key={key}
                        size="small" 
                        hoverable
                        onClick={() => loadTemplate(key)}
                        className="cursor-pointer"
                      >
                        <div className="flex items-center gap-2">
                          <VideoCameraOutlined />
                          <span>{template.name}</span>
                        </div>
                      </Card>
                    ))}
                  </div>
                )
              },
              {
                key: 'elements',
                label: 'Elements',
                children: (
                  <div className="space-y-2">
                    {currentProject?.elements.map((element, index) => (
                      <Card
                        key={element.id}
                        size="small"
                        className={`cursor-pointer ${selectedElement === element.id ? 'border-blue-500' : ''}`}
                        onClick={() => setSelectedElement(element.id)}
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="font-medium">{element.type}</div>
                            <div className="text-xs text-gray-500">
                              {element.content || `${element.width}x${element.height}`}
                            </div>
                          </div>
                          {element.type === 'text' && <FontSizeOutlined />}
                          {element.type === 'rectangle' && <BgColorsOutlined />}
                          {element.type === 'image' && <FileImageOutlined />}
                        </div>
                      </Card>
                    )) || <Text type="secondary">No elements</Text>}
                  </div>
                )
              }
            ]}
          />
        </div>

        {/* Center Panel - Canvas */}
        <div className="flex-1 flex flex-col items-center justify-center p-4 bg-gray-900">
          <div className="relative">
            <canvas
              ref={canvasRef}
              className="border border-gray-600 shadow-2xl"
              style={{ maxWidth: '100%', maxHeight: '70vh' }}
            />
            
            {/* Preview Controls */}
            <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2">
              <Space>
                <Button
                  type="primary"
                  icon={isPlaying ? <EyeOutlined /> : <PlayCircleOutlined />}
                  onClick={() => setIsPlaying(!isPlaying)}
                >
                  {isPlaying ? 'Stop' : 'Preview'}
                </Button>
                <Button icon={<DownloadOutlined />}>
                  Download PNG
                </Button>
              </Space>
            </div>
          </div>
          
          <div className="mt-4 text-center">
            <Text type="secondary">
              Resolution: {currentProject?.width}x{currentProject?.height} | 
              Duration: {currentProject?.duration}s
            </Text>
          </div>
        </div>

        {/* Right Panel - Properties */}
        <div className="w-80 border-l bg-gray-50 p-4 overflow-y-auto">
          <Title level={5}>Properties</Title>
          
          {selectedElementData ? (
            <div className="space-y-4">
              <div>
                <Text strong>Element: {selectedElementData.type}</Text>
              </div>

              {selectedElementData.type === 'text' && (
                <>
                  <div>
                    <Text>Content</Text>
                    <Input
                      value={selectedElementData.content}
                      onChange={(e) => updateElement(selectedElement!, { content: e.target.value })}
                      placeholder="Enter text..."
                    />
                  </div>
                  
                  <div>
                    <Text>Font Size</Text>
                    <Slider
                      min={12}
                      max={120}
                      value={selectedElementData.fontSize}
                      onChange={(value) => updateElement(selectedElement!, { fontSize: value })}
                    />
                  </div>
                  
                  <div>
                    <Text>Font Family</Text>
                    <Select
                      value={selectedElementData.fontFamily}
                      onChange={(value) => updateElement(selectedElement!, { fontFamily: value })}
                      style={{ width: '100%' }}
                    >
                      <Option value="Arial">Arial</Option>
                      <Option value="Arial Black">Arial Black</Option>
                      <Option value="Impact">Impact</Option>
                      <Option value="Times New Roman">Times New Roman</Option>
                      <Option value="Helvetica">Helvetica</Option>
                    </Select>
                  </div>
                  
                  <div>
                    <Text>Color</Text>
                    <ColorPicker
                      value={selectedElementData.color}
                      onChange={(color) => updateElement(selectedElement!, { color: color.toHexString() })}
                    />
                  </div>
                </>
              )}

              {selectedElementData.type === 'rectangle' && (
                <>
                  <div>
                    <Text>Width</Text>
                    <Slider
                      min={50}
                      max={1920}
                      value={selectedElementData.width}
                      onChange={(value) => updateElement(selectedElement!, { width: value })}
                    />
                  </div>
                  
                  <div>
                    <Text>Height</Text>
                    <Slider
                      min={20}
                      max={1080}
                      value={selectedElementData.height}
                      onChange={(value) => updateElement(selectedElement!, { height: value })}
                    />
                  </div>
                  
                  <div>
                    <Text>Color</Text>
                    <ColorPicker
                      value={selectedElementData.color}
                      onChange={(color) => updateElement(selectedElement!, { color: color.toHexString() })}
                    />
                  </div>
                </>
              )}

              <div>
                <Text>Position X</Text>
                <Slider
                  min={0}
                  max={currentProject?.width || 1920}
                  value={selectedElementData.x}
                  onChange={(value) => updateElement(selectedElement!, { x: value })}
                />
              </div>
              
              <div>
                <Text>Position Y</Text>
                <Slider
                  min={0}
                  max={currentProject?.height || 1080}
                  value={selectedElementData.y}
                  onChange={(value) => updateElement(selectedElement!, { y: value })}
                />
              </div>

              <div>
                <Text>Opacity</Text>
                <Slider
                  min={0}
                  max={1}
                  step={0.1}
                  value={selectedElementData.opacity || 1}
                  onChange={(value) => updateElement(selectedElement!, { opacity: value })}
                />
              </div>
            </div>
          ) : (
            <Text type="secondary">Select an element to edit properties</Text>
          )}
        </div>
      </div>

      {/* Export Modal */}
      <Modal
        title="Exporting to MXF"
        open={exportModalVisible}
        footer={null}
        closable={false}
      >
        <div className="text-center py-4">
          <Progress
            type="circle"
            percent={exportProgress}
            status={exportProgress === 100 ? 'success' : 'active'}
          />
          <div className="mt-4">
            <Text>
              {exportProgress === 100 ? 'Export completed!' : 'Rendering graphics...'}
            </Text>
          </div>
        </div>
      </Modal>
    </div>
  );
}
