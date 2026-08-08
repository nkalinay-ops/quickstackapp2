import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import DuplicateModal from './DuplicateModal';
import type { Comic } from '../lib/supabase';

const existingComic: Comic = {
  id: 'comic-1',
  user_id: 'user-123',
  series: 'Hyde Street',
  story: 'Dark Carnival',
  issue_number: '4',
  publisher: 'Image Comics',
  year: 2024,
  condition: 'Near Mint',
  notes: '',
  color_image_url: 'https://example.com/cover.jpg',
  bw_image_url: null,
  copy_count: 2,
  cover_variant: null,
  total_issues: null,
  total_issues_conflict: null,
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
};

const baseProps = {
  isOpen: true,
  onClose: vi.fn(),
  onDiscard: vi.fn(),
  existingComic,
  newComicImage: null,
  onIncreaseCopyCount: vi.fn(),
  onAddAsSeparate: vi.fn(),
  isProcessing: false,
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('DuplicateModal — visibility', () => {
  it('renders nothing when isOpen is false', () => {
    const { container } = render(<DuplicateModal {...baseProps} isOpen={false} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders modal content when isOpen is true', () => {
    render(<DuplicateModal {...baseProps} />);
    expect(screen.getByText('Duplicate Comic Detected')).toBeInTheDocument();
  });
});

describe('DuplicateModal — existing comic display', () => {
  it('displays the existing comic series name', () => {
    render(<DuplicateModal {...baseProps} />);
    expect(screen.getByText('Hyde Street')).toBeInTheDocument();
  });

  it('displays the existing comic issue number', () => {
    render(<DuplicateModal {...baseProps} />);
    expect(screen.getByText(/Issue #4/)).toBeInTheDocument();
  });

  it('displays the current copy count', () => {
    render(<DuplicateModal {...baseProps} />);
    expect(screen.getByText(/Current Copies: 2/)).toBeInTheDocument();
  });

  it('displays copy count + 1 in the increase button label', () => {
    render(<DuplicateModal {...baseProps} />);
    expect(screen.getByRole('button', { name: /Increase to 3 Copies/i })).toBeInTheDocument();
  });

  it('renders the existing comic image when color_image_url is set', () => {
    render(<DuplicateModal {...baseProps} />);
    const img = screen.getByAltText('Existing comic');
    expect(img).toHaveAttribute('src', 'https://example.com/cover.jpg');
  });

  it('does not render existing comic image when color_image_url is null', () => {
    const comic = { ...existingComic, color_image_url: null };
    render(<DuplicateModal {...baseProps} existingComic={comic} />);
    expect(screen.queryByAltText('Existing comic')).toBeNull();
  });
});

describe('DuplicateModal — new scan image', () => {
  it('shows new scan image when newComicImage is provided', () => {
    render(<DuplicateModal {...baseProps} newComicImage="data:image/jpeg;base64,FAKE" />);
    const img = screen.getByAltText('New scan');
    expect(img).toHaveAttribute('src', 'data:image/jpeg;base64,FAKE');
  });

  it('does not render new scan image when newComicImage is null', () => {
    render(<DuplicateModal {...baseProps} newComicImage={null} />);
    expect(screen.queryByAltText('New scan')).toBeNull();
  });
});

describe('DuplicateModal — button interactions', () => {
  it('calls onIncreaseCopyCount when increase button is clicked', async () => {
    render(<DuplicateModal {...baseProps} />);
    await userEvent.click(screen.getByRole('button', { name: /Increase to 3 Copies/i }));
    expect(baseProps.onIncreaseCopyCount).toHaveBeenCalledOnce();
  });

  it('calls onAddAsSeparate when "Add as Separate Entry" is clicked', async () => {
    render(<DuplicateModal {...baseProps} />);
    await userEvent.click(screen.getByRole('button', { name: /Add as Separate Entry/i }));
    expect(baseProps.onAddAsSeparate).toHaveBeenCalledOnce();
  });

  it('calls onDiscard when Discard button is clicked', async () => {
    render(<DuplicateModal {...baseProps} />);
    await userEvent.click(screen.getByRole('button', { name: /Discard/i }));
    expect(baseProps.onDiscard).toHaveBeenCalledOnce();
  });

  it('calls onClose when the X button is clicked', async () => {
    render(<DuplicateModal {...baseProps} />);
    // X button is the one with no text label — aria-hidden icon
    const closeBtn = screen.getByRole('button', { name: '' });
    await userEvent.click(closeBtn);
    expect(baseProps.onClose).toHaveBeenCalledOnce();
  });
});

describe('DuplicateModal — disabled state during processing', () => {
  it('disables all action buttons when isProcessing is true', () => {
    render(<DuplicateModal {...baseProps} isProcessing={true} />);
    expect(screen.getByRole('button', { name: /Processing/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Add as Separate Entry/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Discard/i })).toBeDisabled();
  });

  it('disables the close button when isProcessing is true', () => {
    render(<DuplicateModal {...baseProps} isProcessing={true} />);
    const closeBtn = screen.getByRole('button', { name: '' });
    expect(closeBtn).toBeDisabled();
  });
});
