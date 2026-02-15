import { gql } from '@apollo/client';

export const GET_VIZRT_CONFIGS = gql`
  query GetVizrtConfigs {
    vizrtConfigs {
      id
      name
      mode
      baseUrl
      isActive
      createdAt
      updatedAt
    }
  }
`;

export const GET_VIZRT_TEMPLATES = gql`
  query GetVizrtTemplates($category: VizrtTemplateCategory) {
    vizrtTemplates(category: $category) {
      id
      name
      description
      category
      fields {
        key
        label
        type
        required
        defaultValue
        options
      }
      previewUrl
      createdAt
      updatedAt
    }
  }
`;

export const GET_VIZRT_TEMPLATE = gql`
  query GetVizrtTemplate($id: ID!) {
    vizrtTemplate(id: $id) {
      id
      name
      description
      category
      fields {
        key
        label
        type
        required
        defaultValue
        options
      }
      previewUrl
      createdAt
      updatedAt
    }
  }
`;

export const CREATE_VIZRT_CONFIG = gql`
  mutation CreateVizrtConfig($input: VizrtConfigInput!) {
    createVizrtConfig(input: $input) {
      id
      name
      mode
      baseUrl
      isActive
      createdAt
      updatedAt
    }
  }
`;

export const UPDATE_VIZRT_CONFIG = gql`
  mutation UpdateVizrtConfig($id: ID!, $input: VizrtConfigInput!) {
    updateVizrtConfig(id: $id, input: $input) {
      id
      name
      mode
      baseUrl
      isActive
      updatedAt
    }
  }
`;

export const DELETE_VIZRT_CONFIG = gql`
  mutation DeleteVizrtConfig($id: ID!) {
    deleteVizrtConfig(id: $id)
  }
`;

export const CREATE_VIZRT_TEMPLATE = gql`
  mutation CreateVizrtTemplate($input: VizrtTemplateInput!) {
    createVizrtTemplate(input: $input) {
      id
      name
      description
      category
      fields {
        key
        label
        type
        required
        defaultValue
        options
      }
      previewUrl
      createdAt
      updatedAt
    }
  }
`;

export const UPDATE_VIZRT_TEMPLATE = gql`
  mutation UpdateVizrtTemplate($id: ID!, $input: VizrtTemplateInput!) {
    updateVizrtTemplate(id: $id, input: $input) {
      id
      name
      description
      category
      fields {
        key
        label
        type
        required
        defaultValue
        options
      }
      updatedAt
    }
  }
`;

export const DELETE_VIZRT_TEMPLATE = gql`
  mutation DeleteVizrtTemplate($id: ID!) {
    deleteVizrtTemplate(id: $id)
  }
`;

export const TRIGGER_CG = gql`
  mutation TriggerCG($input: CGTriggerInput!) {
    triggerCG(input: $input) {
      success
      message
      previewUrl
      triggerId
    }
  }
`;

export const PREVIEW_CG = gql`
  mutation PreviewCG($input: CGTriggerInput!) {
    previewCG(input: $input) {
      success
      message
      previewUrl
      triggerId
    }
  }
`;
