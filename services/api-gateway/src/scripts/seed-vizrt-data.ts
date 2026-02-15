import { VizrtConfig, VizrtTemplate, VizrtMode, VizrtTemplateCategory, VizrtFieldType } from '../models/vizrt.models';
import { connectMongoDB } from '../config/mongodb';

async function seedVizrtData() {
  try {
    await connectMongoDB();
    console.log('Connected to MongoDB');

    // Clear existing data
    await VizrtConfig.deleteMany({});
    await VizrtTemplate.deleteMany({});
    console.log('Cleared existing Vizrt data');

    // Seed Configurations
    const configs = [
      {
        name: 'Main Studio Viz Arc',
        mode: VizrtMode.ARC,
        baseUrl: 'http://viz-arc-main:9004',
        isActive: true
      },
      {
        name: 'Backup Viz Engine',
        mode: VizrtMode.ENGINE,
        baseUrl: 'http://viz-engine-backup:21099',
        isActive: false
      },
      {
        name: 'PDS Graphics Server',
        mode: VizrtMode.PDS,
        baseUrl: 'http://pds-server:8580',
        isActive: true
      }
    ];

    const createdConfigs = await VizrtConfig.insertMany(configs);
    console.log(`Created ${createdConfigs.length} Vizrt configurations`);

    // Seed Templates
    const templates = [
      {
        name: 'news-lower-third',
        description: 'Standard news lower third with name and title',
        category: VizrtTemplateCategory.LOWER_THIRD,
        fields: [
          {
            key: 'name',
            label: 'Full Name',
            type: VizrtFieldType.TEXT,
            required: true,
            defaultValue: ''
          },
          {
            key: 'title',
            label: 'Job Title',
            type: VizrtFieldType.TEXT,
            required: true,
            defaultValue: ''
          },
          {
            key: 'location',
            label: 'Location',
            type: VizrtFieldType.TEXT,
            required: false,
            defaultValue: ''
          }
        ]
      },
      {
        name: 'breaking-news-banner',
        description: 'Breaking news banner with headline',
        category: VizrtTemplateCategory.BREAKING_NEWS,
        fields: [
          {
            key: 'headline',
            label: 'Breaking News Headline',
            type: VizrtFieldType.TEXT,
            required: true,
            defaultValue: ''
          },
          {
            key: 'urgency',
            label: 'Urgency Level',
            type: VizrtFieldType.SELECT,
            required: true,
            defaultValue: 'HIGH',
            options: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']
          },
          {
            key: 'show_time',
            label: 'Show Timestamp',
            type: VizrtFieldType.BOOLEAN,
            required: false,
            defaultValue: 'true'
          }
        ]
      },
      {
        name: 'sports-score-bug',
        description: 'Live sports score display',
        category: VizrtTemplateCategory.SCORE_BUG,
        fields: [
          {
            key: 'home_team',
            label: 'Home Team',
            type: VizrtFieldType.TEXT,
            required: true,
            defaultValue: ''
          },
          {
            key: 'away_team',
            label: 'Away Team',
            type: VizrtFieldType.TEXT,
            required: true,
            defaultValue: ''
          },
          {
            key: 'home_score',
            label: 'Home Score',
            type: VizrtFieldType.NUMBER,
            required: true,
            defaultValue: '0'
          },
          {
            key: 'away_score',
            label: 'Away Score',
            type: VizrtFieldType.NUMBER,
            required: true,
            defaultValue: '0'
          },
          {
            key: 'period',
            label: 'Period/Quarter',
            type: VizrtFieldType.TEXT,
            required: false,
            defaultValue: '1st'
          },
          {
            key: 'time_remaining',
            label: 'Time Remaining',
            type: VizrtFieldType.TEXT,
            required: false,
            defaultValue: '15:00'
          }
        ]
      },
      {
        name: 'weather-forecast',
        description: 'Weather forecast display',
        category: VizrtTemplateCategory.WEATHER,
        fields: [
          {
            key: 'location',
            label: 'Location',
            type: VizrtFieldType.TEXT,
            required: true,
            defaultValue: ''
          },
          {
            key: 'current_temp',
            label: 'Current Temperature',
            type: VizrtFieldType.NUMBER,
            required: true,
            defaultValue: '20'
          },
          {
            key: 'condition',
            label: 'Weather Condition',
            type: VizrtFieldType.SELECT,
            required: true,
            defaultValue: 'Sunny',
            options: ['Sunny', 'Cloudy', 'Rainy', 'Stormy', 'Snowy', 'Foggy']
          },
          {
            key: 'high_temp',
            label: 'High Temperature',
            type: VizrtFieldType.NUMBER,
            required: false,
            defaultValue: '25'
          },
          {
            key: 'low_temp',
            label: 'Low Temperature',
            type: VizrtFieldType.NUMBER,
            required: false,
            defaultValue: '15'
          }
        ]
      },
      {
        name: 'election-results',
        description: 'Election results display',
        category: VizrtTemplateCategory.ELECTION_RESULTS,
        fields: [
          {
            key: 'race_title',
            label: 'Race Title',
            type: VizrtFieldType.TEXT,
            required: true,
            defaultValue: ''
          },
          {
            key: 'candidate_1_name',
            label: 'Candidate 1 Name',
            type: VizrtFieldType.TEXT,
            required: true,
            defaultValue: ''
          },
          {
            key: 'candidate_1_votes',
            label: 'Candidate 1 Votes',
            type: VizrtFieldType.NUMBER,
            required: true,
            defaultValue: '0'
          },
          {
            key: 'candidate_1_percentage',
            label: 'Candidate 1 Percentage',
            type: VizrtFieldType.NUMBER,
            required: true,
            defaultValue: '0'
          },
          {
            key: 'candidate_2_name',
            label: 'Candidate 2 Name',
            type: VizrtFieldType.TEXT,
            required: true,
            defaultValue: ''
          },
          {
            key: 'candidate_2_votes',
            label: 'Candidate 2 Votes',
            type: VizrtFieldType.NUMBER,
            required: true,
            defaultValue: '0'
          },
          {
            key: 'candidate_2_percentage',
            label: 'Candidate 2 Percentage',
            type: VizrtFieldType.NUMBER,
            required: true,
            defaultValue: '0'
          },
          {
            key: 'precincts_reporting',
            label: 'Precincts Reporting (%)',
            type: VizrtFieldType.NUMBER,
            required: false,
            defaultValue: '0'
          }
        ]
      },
      {
        name: 'sports-ticker',
        description: 'Sports scores ticker',
        category: VizrtTemplateCategory.SPORTS_TICKER,
        fields: [
          {
            key: 'ticker_text',
            label: 'Ticker Text',
            type: VizrtFieldType.TEXT,
            required: true,
            defaultValue: ''
          },
          {
            key: 'scroll_speed',
            label: 'Scroll Speed',
            type: VizrtFieldType.SELECT,
            required: false,
            defaultValue: 'NORMAL',
            options: ['SLOW', 'NORMAL', 'FAST']
          },
          {
            key: 'background_color',
            label: 'Background Color',
            type: VizrtFieldType.COLOR,
            required: false,
            defaultValue: '#000000'
          }
        ]
      }
    ];

    const createdTemplates = await VizrtTemplate.insertMany(templates);
    console.log(`Created ${createdTemplates.length} CG templates`);

    console.log('Vizrt data seeded successfully!');
    
  } catch (error) {
    console.error('Error seeding Vizrt data:', error);
  } finally {
    process.exit(0);
  }
}

// Run the seed function
seedVizrtData();
