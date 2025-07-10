import React, { useState } from 'react';
import { ModalHalfStar } from './ModalHalfStar';

interface ModalStarRatingProps {
    label: string;
    currentRating: number | null;
    onRate: (rating: number) => void;
    isSubmitting: boolean;
}

export const ModalStarRating: React.FC<ModalStarRatingProps> = ({
    label,
    currentRating,
    onRate,
    isSubmitting
}) => {
    const [hover, setHover] = useState(0);

    const displayRating = hover || currentRating || 0;
    const currentHasDecimal =
        currentRating !== null && currentRating !== Math.round(currentRating);

    return (
        <div className="mt-2">
            <p className="text-xs text-(--color-text-secondary)">{label}</p>
            <div
                className="flex items-center space-x-1"
                onMouseLeave={() => setHover(0)}
            >
                {[...Array(10)].map((_, i) => {
                    const starNumber = i + 1;
                    return (
                        <ModalHalfStar
                            key={starNumber}
                            rating={starNumber}
                            currentValue={displayRating}
                            onLeftClick={() => onRate(starNumber - 0.5)}
                            onRightClick={() => onRate(starNumber)}
                            onLeftHover={() => setHover(starNumber - 0.5)}
                            onRightHover={() => setHover(starNumber)}
                            onMouseLeave={() => {}}
                            readOnly={isSubmitting}
                        />
                    );
                })}
            </div>

            {/* Rating display and service info */}
            <div className="flex items-center justify-center mt-2 space-x-2">
                {currentRating && (
                    <span className="text-xs text-(--color-text-secondary)">
                        Current: {currentRating}
                    </span>
                )}
            </div>

            {currentHasDecimal && (
                <div className="mt-1 text-center text-xs text-(--color-text-secondary)">
                    AniList: {currentRating} • Trakt:{' '}
                    {Math.round(currentRating)}
                </div>
            )}
        </div>
    );
};
