'use client';

import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import '../../styles/graphics-studio.css';
import { 
  Layout,
  Button,
  Space,
  Card,
  Input,
  Select,
  Slider,
  Modal,
  message,
  Typography,
  Row,
  Col,
  List,
  InputNumber,
  Tooltip,
  Alert,
  Form,
  ColorPicker,
  Divider,
  Tag,
  Progress,
  Segmented
} from 'antd';
import {
  PlusOutlined,
  FileImageOutlined,
  FontSizeOutlined,
  BgColorsOutlined,
  PlayCircleOutlined,
  PauseOutlined,
  ExportOutlined,
  UndoOutlined,
  RedoOutlined,
  CopyOutlined,
  DeleteOutlined,
  EyeOutlined,
  EyeInvisibleOutlined,
  BorderOutlined,
  FontColorsOutlined,
  PictureOutlined,
  VideoCameraOutlined,
  ThunderboltOutlined,
  DownloadOutlined,
  UploadOutlined,
  FormatPainterOutlined
} from '@ant-design/icons';

const { Header, Sider, Content } = Layout;
const { Title, Text } = Typography;

// Professional Templates with actual graphics
const TEMPLATES = {
  news_lower_third: {
    name: 'News Lower Third',
    category: 'News',
    preview: '📺 Professional news graphics',
    elements: [
      {
        id: 'background',
        type: 'rect',
        x: 50,
        y: 450,
        width: 700,
        height: 100,
        fill: '#1e293b',
        opacity: 0.95,
        animation: 'slideInLeft'
      },
      {
        id: 'accent',
        type: 'rect',
        x: 50,
        y: 450,
        width: 5,
        height: 100,
        fill: '#ef4444',
        animation: 'expandWidth'
      },
      {
        id: 'name',
        type: 'text',
        x: 80,
        y: 470,
        text: 'BREAKING NEWS',
        fontSize: 28,
        fontFamily: 'Arial Black',
        fill: '#ffffff',
        fontWeight: 'bold'
      },
      {
        id: 'subtitle',
        type: 'text',
        x: 80,
        y: 510,
        text: 'Live from the newsroom',
        fontSize: 18,
        fontFamily: 'Arial',
        fill: '#e2e8f0'
      }
    ]
  },
  scoreboard: {
    name: 'Sports Score',
    category: 'Sports',
    preview: '⚽ Live score display',
    elements: [
      {
        id: 'bg',
        type: 'rect',
        x: 50,
        y: 50,
        width: 300,
        height: 150,
        fill: '#000000',
        opacity: 0.8,
        radius: 10
      },
      {
        id: 'divider',
        type: 'rect',
        x: 199,
        y: 50,
        width: 2,
        height: 150,
        fill: '#ffffff',
        opacity: 0.3
      },
      {
        id: 'home',
        type: 'text',
        x: 80,
        y: 80,
        text: 'HOME',
        fontSize: 24,
        fill: '#ffffff',
        fontWeight: 'bold'
      },
      {
        id: 'away',
        type: 'text',
        x: 230,
        y: 80,
        text: 'AWAY',
        fontSize: 24,
        fill: '#ffffff',
        fontWeight: 'bold'
      },
      {
        id: 'score1',
        type: 'text',
        x: 100,
        y: 130,
        text: '0',
        fontSize: 48,
        fill: '#00ff00',
        fontWeight: 'bold'
      },
      {
        id: 'score2',
        type: 'text',
        x: 250,
        y: 130,
        text: '0',
        fontSize: 48,
        fill: '#ff0000',
        fontWeight: 'bold'
      }
    ]
  },
  title_card: {
    name: 'Title Card',
    category: 'General',
    preview: '🎬 Full screen titles',
    elements: [
      {
        id: 'overlay',
        type: 'rect',
        x: 0,
        y: 0,
        width: 960,
        height: 540,
        fill: '#0f172a',
        opacity: 0.85
      },
      {
        id: 'title',
        type: 'text',
        x: 480,
        y: 250,
        text: 'MAIN TITLE',
        fontSize: 72,
        fill: '#ffffff',
        fontWeight: 'bold',
        align: 'center'
      },
      {
        id: 'subtitle',
        type: 'text',
        x: 480,
        y: 320,
        text: 'Subtitle goes here',
        fontSize: 32,
        fill: '#94a3b8',
        align: 'center'
      }
    ]
  }
};

interface Element {
  id: string;
  type: 'rect' | 'text' | 'image' | 'circle';
  x: number;
  y: number;
  width?: number;
  height?: number;
  text?: string;
  fontSize?: number;
  fontFamily?: string;
  fontWeight?: string;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  opacity?: number;
  radius?: number;
  align?: string;
  animation?: string;
  visible?: boolean;
  locked?: boolean;
}

// Common web-safe fonts
const DEFAULT_FONTS = [
  'Arial',
  'Arial Black',
  'Times New Roman',
  'Georgia',
  'Courier New',
  'Verdana',
  'Trebuchet MS',
  'Impact',
  'Comic Sans MS',
  'Tahoma',
  'Lucida Console',
  'Lucida Sans Unicode',
  'Palatino Linotype',
  'Book Antiqua',
  'Garamond'
];

export default function EnterpriseGraphicsStudio() {
  const [elements, setElements] = useState<Element[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tool, setTool] = useState<'select' | 'rect' | 'text' | 'circle'>('select');
  const [isPlaying, setIsPlaying] = useState(false);
  const [history, setHistory] = useState<Element[][]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [exportModalVisible, setExportModalVisible] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [elementStart, setElementStart] = useState({ x: 0, y: 0 });
  const [availableFonts, setAvailableFonts] = useState<string[]>(DEFAULT_FONTS);
  
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>();

  // Canvas setup
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    canvas.width = 960;
    canvas.height = 540;
    
    drawCanvas();
  }, []);

  // Detect local fonts
  useEffect(() => {
    const detectFonts = async () => {
      if ('queryLocalFonts' in window) {
        try {
          // @ts-ignore - queryLocalFonts is experimental
          const localFonts = await window.queryLocalFonts();
          const fontNames = new Set<string>();
          
          // Add default fonts
          DEFAULT_FONTS.forEach(font => fontNames.add(font));
          
          // Add local fonts
          localFonts.forEach((font: any) => {
            fontNames.add(font.family);
          });
          
          setAvailableFonts(Array.from(fontNames).sort());
        } catch (error) {
          console.log('Local font access denied or not supported');
          
          // Try alternative method - check if fonts are available
          const testFonts = [
            'Helvetica', 'Helvetica Neue', 'Calibri', 'Segoe UI',
            'San Francisco', 'Roboto', 'Ubuntu', 'Fira Sans',
            'Open Sans', 'Lato', 'Montserrat', 'Raleway',
            'Poppins', 'Source Sans Pro', 'Noto Sans', 'Proxima Nova',
            'Avenir', 'Futura', 'Century Gothic', 'Franklin Gothic',
            'Gill Sans', 'Optima', 'Candara', 'Geneva'
          ];
          
          const availableFontList = [...DEFAULT_FONTS];
          
          // Simple font detection
          testFonts.forEach(font => {
            const canvas = document.createElement('canvas');
            const context = canvas.getContext('2d');
            if (context) {
              const testString = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
              
              // Measure with monospace as baseline
              context.font = '72px monospace';
              const baselineWidth = context.measureText(testString).width;
              
              // Measure with test font
              context.font = `72px "${font}", monospace`;
              const testWidth = context.measureText(testString).width;
              
              // If widths differ, font is likely available
              if (Math.abs(baselineWidth - testWidth) > 0.01) {
                availableFontList.push(font);
              }
            }
          });
          
          setAvailableFonts(availableFontList.sort());
        }
      }
    };
    
    detectFonts();
  }, []);

  // Draw canvas
  const drawCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear and set background
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw grid
    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    ctx.lineWidth = 1;
    for (let x = 0; x <= canvas.width; x += 30) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, canvas.height);
      ctx.stroke();
    }
    for (let y = 0; y <= canvas.height; y += 30) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(canvas.width, y);
      ctx.stroke();
    }

    // Draw elements
    elements.forEach(element => {
      if (element.visible === false) return;
      
      ctx.save();
      ctx.globalAlpha = element.opacity ?? 1;

      switch (element.type) {
        case 'rect':
          ctx.fillStyle = element.fill || '#ffffff';
          if (element.radius) {
            // Rounded rectangle
            ctx.beginPath();
            ctx.roundRect(element.x, element.y, element.width || 100, element.height || 100, element.radius);
            ctx.fill();
          } else {
            ctx.fillRect(element.x, element.y, element.width || 100, element.height || 100);
          }
          if (element.stroke) {
            ctx.strokeStyle = element.stroke;
            ctx.lineWidth = element.strokeWidth || 2;
            ctx.strokeRect(element.x, element.y, element.width || 100, element.height || 100);
          }
          break;

        case 'text':
          ctx.font = `${element.fontWeight || 'normal'} ${element.fontSize || 24}px ${element.fontFamily || 'Arial'}`;
          ctx.fillStyle = element.fill || '#ffffff';
          ctx.textBaseline = 'top';
          
          if (element.align === 'center') {
            ctx.textAlign = 'center';
          } else {
            ctx.textAlign = 'left';
          }
          
          ctx.fillText(element.text || 'Text', element.x, element.y);
          break;

        case 'circle':
          ctx.fillStyle = element.fill || '#ffffff';
          ctx.beginPath();
          ctx.arc(element.x, element.y, element.width || 50, 0, Math.PI * 2);
          ctx.fill();
          if (element.stroke) {
            ctx.strokeStyle = element.stroke;
            ctx.lineWidth = element.strokeWidth || 2;
            ctx.stroke();
          }
          break;
      }

      ctx.restore();

      // Draw selection
      if (element.id === selectedId) {
        ctx.strokeStyle = '#00d4ff';
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 5]);
        
        if (element.type === 'text') {
          ctx.font = `${element.fontSize || 24}px ${element.fontFamily || 'Arial'}`;
          const metrics = ctx.measureText(element.text || 'Text');
          ctx.strokeRect(
            element.x - 5,
            element.y - 5,
            metrics.width + 10,
            (element.fontSize || 24) + 10
          );
        } else if (element.type === 'circle') {
          ctx.beginPath();
          ctx.arc(element.x, element.y, (element.width || 50) + 5, 0, Math.PI * 2);
          ctx.stroke();
        } else {
          ctx.strokeRect(
            element.x - 2,
            element.y - 2,
            (element.width || 100) + 4,
            (element.height || 100) + 4
          );
        }
        ctx.setLineDash([]);
      }
    });
  }, [elements, selectedId]);

  // Redraw on changes
  useEffect(() => {
    drawCanvas();
  }, [elements, selectedId, drawCanvas]);

  // Save history
  const saveHistory = useCallback(() => {
    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push(JSON.parse(JSON.stringify(elements)));
    setHistory(newHistory);
    setHistoryIndex(newHistory.length - 1);
  }, [elements, history, historyIndex]);

  // Load template
  const loadTemplate = (templateKey: string) => {
    const template = TEMPLATES[templateKey as keyof typeof TEMPLATES];
    if (!template) return;
    
    setElements(template.elements.map(el => ({ 
      ...el, 
      type: el.type as Element['type'],
      visible: true 
    })));
    setSelectedId(null);
    saveHistory();
    message.success(`Loaded: ${template.name}`);
  };

  // Add element
  const addElement = (type: Element['type']) => {
    const newElement: Element = {
      id: `${type}_${Date.now()}`,
      type,
      x: 100,
      y: 100,
      fill: type === 'text' ? '#ffffff' : '#10b981',
      visible: true,
      locked: false
    };

    if (type === 'rect') {
      newElement.width = 200;
      newElement.height = 100;
    } else if (type === 'circle') {
      newElement.width = 50;
    } else if (type === 'text') {
      newElement.text = 'New Text';
      newElement.fontSize = 32;
    }

    setElements([...elements, newElement]);
    setSelectedId(newElement.id);
    saveHistory();
  };

  // Canvas mouse events
  const handleCanvasMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (tool === 'select') {
      // Find clicked element
      let clicked = null;
      for (let i = elements.length - 1; i >= 0; i--) {
        const el = elements[i];
        if (el.visible === false || el.locked) continue;

        if (el.type === 'rect') {
          if (x >= el.x && x <= el.x + (el.width || 0) &&
              y >= el.y && y <= el.y + (el.height || 0)) {
            clicked = el;
            break;
          }
        } else if (el.type === 'circle') {
          const dist = Math.sqrt((x - el.x) ** 2 + (y - el.y) ** 2);
          if (dist <= (el.width || 50)) {
            clicked = el;
            break;
          }
        } else if (el.type === 'text') {
          const ctx = canvasRef.current?.getContext('2d');
          if (ctx) {
            ctx.font = `${el.fontSize || 24}px ${el.fontFamily || 'Arial'}`;
            const metrics = ctx.measureText(el.text || '');
            if (x >= el.x && x <= el.x + metrics.width &&
                y >= el.y && y <= el.y + (el.fontSize || 24)) {
              clicked = el;
              break;
            }
          }
        }
      }

      if (clicked) {
        setSelectedId(clicked.id);
        setIsDragging(true);
        setDragStart({ x: e.clientX, y: e.clientY });
        setElementStart({ x: clicked.x, y: clicked.y });
      } else {
        setSelectedId(null);
      }
    } else {
      // Create new element
      if (tool === 'rect') {
        const newEl: Element = {
          id: `rect_${Date.now()}`,
          type: 'rect',
          x,
          y,
          width: 100,
          height: 60,
          fill: '#10b981',
          visible: true
        };
        setElements([...elements, newEl]);
        setSelectedId(newEl.id);
      } else if (tool === 'text') {
        const newEl: Element = {
          id: `text_${Date.now()}`,
          type: 'text',
          x,
          y,
          text: 'Text',
          fontSize: 32,
          fill: '#ffffff',
          visible: true
        };
        setElements([...elements, newEl]);
        setSelectedId(newEl.id);
      } else if (tool === 'circle') {
        const newEl: Element = {
          id: `circle_${Date.now()}`,
          type: 'circle',
          x,
          y,
          width: 50,
          fill: '#f59e0b',
          visible: true
        };
        setElements([...elements, newEl]);
        setSelectedId(newEl.id);
      }
      saveHistory();
      setTool('select');
    }
  };

  const handleCanvasMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDragging || !selectedId) return;

    const dx = e.clientX - dragStart.x;
    const dy = e.clientY - dragStart.y;

    setElements(elements.map(el => 
      el.id === selectedId 
        ? { ...el, x: elementStart.x + dx, y: elementStart.y + dy }
        : el
    ));
  };

  const handleCanvasMouseUp = () => {
    if (isDragging) {
      setIsDragging(false);
      saveHistory();
    }
  };

  // Selected element
  const selectedElement = useMemo(
    () => elements.find(el => el.id === selectedId),
    [elements, selectedId]
  );

  // Update element
  const updateElement = (updates: Partial<Element>) => {
    if (!selectedId) return;
    
    setElements(elements.map(el => 
      el.id === selectedId ? { ...el, ...updates } : el
    ));
    
    // Trigger canvas redraw after update
    setTimeout(() => drawCanvas(), 0);
  };

  // Delete element
  const deleteElement = () => {
    if (!selectedId) return;
    
    setElements(elements.filter(el => el.id !== selectedId));
    setSelectedId(null);
    saveHistory();
  };

  // Duplicate element
  const duplicateElement = () => {
    if (!selectedElement) return;
    
    const newEl = {
      ...selectedElement,
      id: `${selectedElement.type}_${Date.now()}`,
      x: selectedElement.x + 20,
      y: selectedElement.y + 20
    };
    
    setElements([...elements, newEl]);
    setSelectedId(newEl.id);
    saveHistory();
  };

  // Undo/Redo
  const undo = () => {
    if (historyIndex > 0) {
      const newIndex = historyIndex - 1;
      setElements(JSON.parse(JSON.stringify(history[newIndex])));
      setHistoryIndex(newIndex);
    }
  };

  const redo = () => {
    if (historyIndex < history.length - 1) {
      const newIndex = historyIndex + 1;
      setElements(JSON.parse(JSON.stringify(history[newIndex])));
      setHistoryIndex(newIndex);
    }
  };

  // Animation preview
  const playAnimation = () => {
    setIsPlaying(true);
    let start = Date.now();
    
    const animate = () => {
      const elapsed = Date.now() - start;
      const progress = (elapsed % 3000) / 3000;
      
      // Simple animation effects
      drawCanvas();
      
      if (isPlaying) {
        animationRef.current = requestAnimationFrame(animate);
      }
    };
    
    animate();
  };

  const stopAnimation = () => {
    setIsPlaying(false);
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
    }
  };

  // Export
  const handleExport = async (values: any) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    try {
      const blob = await new Promise<Blob>((resolve) => {
        canvas.toBlob((blob) => resolve(blob!), 'image/png');
      });

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `graphics_${Date.now()}.png`;
      a.click();
      URL.revokeObjectURL(url);

      message.success('Exported successfully!');
      setExportModalVisible(false);
    } catch (error) {
      message.error('Export failed');
    }
  };

  return (
    <div className="graphics-studio-container h-full bg-gray-950 text-white">
      {/* Header */}
      <div className="h-16 bg-gray-900 border-b border-gray-800 px-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Title level={4} className="mb-0 text-white">Graphics Studio</Title>
          <Tag color="green">PRO</Tag>
        </div>
        
        <Space size="large">
          {/* Tool buttons */}
          <Segmented
            value={tool}
            onChange={(value) => setTool(value as any)}
            options={[
              { value: 'select', icon: <Tooltip title="Select"><FormatPainterOutlined /></Tooltip> },
              { value: 'rect', icon: <Tooltip title="Rectangle"><BorderOutlined /></Tooltip> },
              { value: 'text', icon: <Tooltip title="Text"><FontSizeOutlined /></Tooltip> },
              { value: 'circle', icon: <Tooltip title="Circle"><PictureOutlined /></Tooltip> }
            ]}
          />

          {/* History */}
          <Space>
            <Button icon={<UndoOutlined />} onClick={undo} disabled={historyIndex <= 0} />
            <Button icon={<RedoOutlined />} onClick={redo} disabled={historyIndex >= history.length - 1} />
          </Space>

          {/* Actions */}
          <Space>
            <Button 
              type={isPlaying ? 'primary' : 'default'}
              icon={isPlaying ? <PauseOutlined /> : <PlayCircleOutlined />}
              onClick={isPlaying ? stopAnimation : playAnimation}
            >
              {isPlaying ? 'Stop' : 'Preview'}
            </Button>
            <Button type="primary" icon={<ExportOutlined />} onClick={() => setExportModalVisible(true)}>
              Export
            </Button>
          </Space>
        </Space>
      </div>

      <div className="flex h-[calc(100%-4rem)]">
        {/* Left Sidebar - Templates */}
        <div className="w-80 bg-gray-900 border-r border-gray-800 p-4 overflow-y-auto">
          <div className="mb-4">
            <h3 className="text-lg font-semibold mb-3 text-white">Templates</h3>
            <Space direction="vertical" className="w-full">
              {Object.entries(TEMPLATES).map(([key, template]) => (
                <Card 
                  key={key}
                  size="small" 
                  className="cursor-pointer hover:border-blue-500 transition-colors bg-gray-800 border-gray-700"
                  onClick={() => loadTemplate(key)}
                  styles={{
                    body: { backgroundColor: '#1f2937' }
                  }}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-medium text-white">{template.name}</div>
                      <div className="text-xs text-gray-400">{template.category}</div>
                    </div>
                    <div className="text-2xl">{template.preview.split(' ')[0]}</div>
                  </div>
                </Card>
              ))}
            </Space>
          </div>

          <Divider className="border-gray-700" />

          <div className="mb-4">
            <h3 className="text-lg font-semibold mb-3 text-white">Add Elements</h3>
            <Space wrap>
              <Button 
                icon={<BorderOutlined />} 
                onClick={() => addElement('rect')}
                className="bg-gray-800 border-gray-700 text-white hover:bg-gray-700 hover:border-gray-600 hover:text-white"
              >
                Rectangle
              </Button>
              <Button 
                icon={<FontSizeOutlined />} 
                onClick={() => addElement('text')}
                className="bg-gray-800 border-gray-700 text-white hover:bg-gray-700 hover:border-gray-600 hover:text-white"
              >
                Text
              </Button>
              <Button 
                icon={<PictureOutlined />} 
                onClick={() => addElement('circle')}
                className="bg-gray-800 border-gray-700 text-white hover:bg-gray-700 hover:border-gray-600 hover:text-white"
              >
                Circle
              </Button>
            </Space>
          </div>

          <Divider className="border-gray-700" />

          <div>
            <h3 className="text-lg font-semibold mb-3 text-white">Layers</h3>
            <div className="space-y-1">
              {[...elements].reverse().map((element) => (
                <div
                  key={element.id}
                  className={`cursor-pointer px-3 py-2 rounded flex items-center justify-between ${
                    selectedId === element.id 
                      ? 'bg-blue-600 text-white' 
                      : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                  }`}
                  onClick={() => setSelectedId(element.id)}
                >
                  <Space>
                    <Button
                      size="small"
                      type="text"
                      className={selectedId === element.id ? 'text-white' : 'text-gray-400'}
                      icon={element.visible !== false ? <EyeOutlined /> : <EyeInvisibleOutlined />}
                      onClick={(e) => {
                        e.stopPropagation();
                        updateElement({ visible: !element.visible });
                      }}
                    />
                    <span className="font-medium">{element.id.split('_')[0]}</span>
                  </Space>
                  <Button
                    size="small"
                    type="text"
                    danger
                    icon={<DeleteOutlined />}
                    className={selectedId === element.id ? 'text-red-300 hover:text-red-200' : ''}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (element.id === selectedId) {
                        deleteElement();
                      } else {
                        setElements(elements.filter(el => el.id !== element.id));
                      }
                    }}
                  />
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Canvas */}
        <div className="flex-1 bg-gray-950 flex items-center justify-center p-8">
          <div className="relative">
            <canvas
              ref={canvasRef}
              className="shadow-2xl cursor-crosshair"
              onMouseDown={handleCanvasMouseDown}
              onMouseMove={handleCanvasMouseMove}
              onMouseUp={handleCanvasMouseUp}
              onMouseLeave={handleCanvasMouseUp}
            />
          </div>
        </div>

        {/* Right Sidebar - Properties */}
        <div className="w-80 bg-gray-900 border-l border-gray-800 p-4 overflow-y-auto">
          {selectedElement ? (
            <>
              <h3 className="text-lg font-semibold mb-4 text-white">Properties</h3>
              
              <div className="space-y-4">
                {/* Position */}
                <div>
                  <Text className="text-gray-300 font-medium">Position</Text>
                  <Row gutter={8} className="mt-2">
                    <Col span={12}>
                      <InputNumber
                        prefix="X"
                        value={selectedElement.x}
                        onChange={(x) => x !== null && updateElement({ x })}
                        className="w-full"
                      />
                    </Col>
                    <Col span={12}>
                      <InputNumber
                        prefix="Y"
                        value={selectedElement.y}
                        onChange={(y) => y !== null && updateElement({ y })}
                        className="w-full"
                      />
                    </Col>
                  </Row>
                </div>

                {/* Size */}
                {selectedElement.type !== 'text' && (
                  <div>
                    <Text className="text-gray-300 font-medium">Size</Text>
                    <Row gutter={8} className="mt-2">
                      <Col span={12}>
                        <InputNumber
                          prefix="W"
                          value={selectedElement.width}
                          onChange={(width) => width !== null && updateElement({ width })}
                          className="w-full"
                        />
                      </Col>
                      {selectedElement.type === 'rect' && (
                        <Col span={12}>
                          <InputNumber
                            prefix="H"
                            value={selectedElement.height}
                            onChange={(height) => height !== null && updateElement({ height })}
                            className="w-full"
                          />
                        </Col>
                      )}
                    </Row>
                  </div>
                )}

                {/* Text properties */}
                {selectedElement.type === 'text' && (
                  <>
                    <div>
                      <Text className="text-gray-300 font-medium">Text</Text>
                      <Input
                        value={selectedElement.text}
                        onChange={(e) => updateElement({ text: e.target.value })}
                        className="mt-2"
                      />
                    </div>
                    <div>
                      <Text className="text-gray-300 font-medium">Font Size</Text>
                      <Slider
                        min={12}
                        max={120}
                        value={selectedElement.fontSize || 24}
                        onChange={(fontSize) => updateElement({ fontSize })}
                        tooltip={{ formatter: (value) => `${value}px` }}
                        className="mt-2"
                      />
                    </div>
                    <div>
                      <Text className="text-gray-300 font-medium">Font</Text>
                      <Select
                        value={selectedElement.fontFamily || 'Arial'}
                        onChange={(fontFamily) => updateElement({ fontFamily })}
                        className="w-full mt-2"
                        popupClassName="bg-gray-800"
                        showSearch
                        filterOption={(input, option) =>
                          (option?.label as string).toLowerCase().includes(input.toLowerCase())
                        }
                        placeholder="Search fonts..."
                        options={availableFonts.map(font => ({
                          label: font,
                          value: font,
                          style: { fontFamily: font }
                        }))}
                        dropdownRender={(menu) => (
                          <>
                            {menu}
                            {availableFonts.length <= DEFAULT_FONTS.length && 'queryLocalFonts' in window && (
                              <div className="p-2 border-t border-gray-700">
                                <Button
                                  size="small"
                                  onClick={async () => {
                                    try {
                                      // @ts-ignore
                                      await window.queryLocalFonts();
                                      window.location.reload();
                                    } catch (error) {
                                      message.info('Please allow font access to see all system fonts');
                                    }
                                  }}
                                  className="w-full"
                                >
                                  Load System Fonts
                                </Button>
                              </div>
                            )}
                          </>
                        )}
                      />
                    </div>
                  </>
                )}

                {/* Color */}
                <div>
                  <Text className="text-gray-300 font-medium">Fill Color</Text>
                  <div className="mt-2 space-y-2">
                    {/* Custom Color Button */}
                    <div className="flex items-center gap-2">
                      <ColorPicker
                        value={selectedElement.fill || '#ffffff'}
                        onChangeComplete={(color) => {
                          updateElement({ fill: color.toHexString() });
                        }}
                        trigger="click"
                        showText={false}
                        presets={[
                          {
                            label: 'Broadcast Colors',
                            colors: [
                              '#FF0000', '#00FF00', '#0000FF', '#FFFF00', '#FF00FF', '#00FFFF',
                              '#000000', '#FFFFFF', '#808080', '#800000', '#008000', '#000080',
                              '#FFA500', '#800080', '#FFC0CB', '#FFD700', '#C0C0C0', '#A52A2A'
                            ],
                          },
                          {
                            label: 'News Graphics',
                            colors: [
                              '#CC0000', '#003366', '#FFD700', '#1E90FF', '#DC143C', '#4B0082',
                              '#FF6B6B', '#4ECDC4', '#45B7D1', '#F7DC6F', '#BB8FCE', '#85C1E2'
                            ],
                          }
                        ]}
                      >
                        <button
                          className="flex items-center gap-2 px-3 py-2 bg-gray-800 hover:bg-gray-700 border border-gray-600 rounded-lg transition-colors w-full"
                        >
                          <div 
                            className="w-8 h-8 rounded border-2 border-gray-500"
                            style={{ backgroundColor: selectedElement.fill || '#ffffff' }}
                          />
                          <span className="text-white font-mono text-sm">
                            {selectedElement.fill || '#FFFFFF'}
                          </span>
                          <svg className="w-4 h-4 text-gray-400 ml-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                          </svg>
                        </button>
                      </ColorPicker>
                      
                      {/* Hex Input */}
                      <Input
                        value={selectedElement.fill || '#ffffff'}
                        onChange={(e) => {
                          const value = e.target.value;
                          if (/^#[0-9A-F]{6}$/i.test(value) || value.length < 7) {
                            updateElement({ fill: value });
                          }
                        }}
                        placeholder="#FFFFFF"
                        className="w-24"
                        maxLength={7}
                      />
                    </div>
                    
                    {/* Quick Color Swatches */}
                    <div className="flex flex-wrap gap-1">
                      {['#FF0000', '#00FF00', '#0000FF', '#FFFF00', '#FF00FF', '#00FFFF', '#000000', '#FFFFFF'].map(color => (
                        <button
                          key={color}
                          className="w-8 h-8 rounded border-2 border-gray-600 hover:border-gray-400 transition-colors"
                          style={{ backgroundColor: color }}
                          onClick={() => updateElement({ fill: color })}
                          title={color}
                        />
                      ))}
                    </div>
                  </div>
                </div>

                {/* Opacity */}
                <div>
                  <Text className="text-gray-300 font-medium">Opacity</Text>
                  <Slider
                    min={0}
                    max={1}
                    step={0.1}
                    value={selectedElement.opacity || 1}
                    onChange={(opacity) => updateElement({ opacity })}
                    tooltip={{ formatter: (value) => `${Math.round((value || 0) * 100)}%` }}
                    className="mt-2"
                  />
                </div>

                {/* Actions */}
                <Divider className="border-gray-700" />
                <Space>
                  <Button 
                    icon={<CopyOutlined />} 
                    onClick={duplicateElement}
                    className="bg-gray-800 border-gray-700 text-white hover:bg-gray-700 hover:border-gray-600 hover:text-white"
                  >
                    Duplicate
                  </Button>
                  <Button 
                    icon={<DeleteOutlined />} 
                    danger 
                    onClick={deleteElement}
                  >
                    Delete
                  </Button>
                </Space>
              </div>
            </>
          ) : (
            <div className="text-center text-gray-400 mt-10">
              <p className="text-lg">Select an element to edit properties</p>
              <p className="text-sm mt-2">Click on any element in the canvas</p>
            </div>
          )}
        </div>
      </div>

      {/* Export Modal */}
      <Modal
        title="Export Graphics"
        open={exportModalVisible}
        onCancel={() => setExportModalVisible(false)}
        footer={null}
        width={500}
      >
        <Form onFinish={handleExport} layout="vertical">
          <Alert
            message="Export Options"
            description="Your graphic will be exported as a high-quality PNG image. For video formats, use professional software to import the PNG sequence."
            type="info"
            className="mb-4"
          />
          
          <Form.Item>
            <Space>
              <Button type="primary" htmlType="submit" icon={<DownloadOutlined />}>
                Export as PNG
              </Button>
              <Button onClick={() => setExportModalVisible(false)}>
                Cancel
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}