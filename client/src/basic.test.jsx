import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from './App.jsx';

describe('landing page', () => {
  it('introduces the investigation and links to start a case', () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><MemoryRouter><App /></MemoryRouter></QueryClientProvider>);
    expect(screen.getByText(/Every clue/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Start a case/i })).toBeInTheDocument();
  });
});
