import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { Logo } from './Logo';

describe('Logo', () => {
    it('renders the logo image with correct alt text', () => {
        render(<Logo />);

        const logo = screen.getByAltText("Guardian's Embrace Logo");
        expect(logo).toBeInTheDocument();
        expect(logo).toHaveAttribute('src', '/logo.png');
    });

    it('applies custom className and size', () => {
        render(<Logo className="test-class" size={100} />);

        const logo = screen.getByAltText("Guardian's Embrace Logo");
        expect(logo).toHaveClass('test-class');
        expect(logo).toHaveStyle({ width: '100px' });
    });
});
