import React from 'react';

interface ModalHalfStarProps {
    rating: number;
    currentValue: number;
    onLeftClick: () => void;
    onRightClick: () => void;
    onLeftHover: () => void;
    onRightHover: () => void;
    onMouseLeave: () => void;
    readOnly?: boolean;
}

export const ModalHalfStar: React.FC<ModalHalfStarProps> = ({
    rating,
    currentValue,
    onLeftClick,
    onRightClick,
    onLeftHover,
    onRightHover,
    onMouseLeave,
    readOnly
}) => {
    const leftHalf = currentValue >= rating - 0.5;
    const rightHalf = currentValue >= rating;

    return (
        <div
            className="relative w-5 h-5 cursor-pointer"
            onMouseLeave={readOnly ? undefined : onMouseLeave}
        >
            <svg
                className="absolute inset-0 w-5 h-5 text-(--color-star-empty)"
                fill="currentColor"
                viewBox="0 0 20 20"
                xmlns="http://www.w3.org/2000/svg"
            >
                <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
            </svg>

            {/* Left half overlay */}
            {leftHalf && (
                <svg
                    className="absolute inset-0 w-5 h-5 text-(--color-star-filled)"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                    style={{ clipPath: 'inset(0 50% 0 0)' }}
                >
                    <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                </svg>
            )}

            {/* Right half overlay */}
            {rightHalf && (
                <svg
                    className="absolute inset-0 w-5 h-5 text-(--color-star-filled)"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                    style={{ clipPath: 'inset(0 0 0 50%)' }}
                >
                    <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                </svg>
            )}

            {/* Invisible click areas */}
            {!readOnly && (
                <>
                    <div
                        className="absolute inset-0 w-1/2 h-full cursor-pointer"
                        onClick={onLeftClick}
                        onMouseEnter={onLeftHover}
                    />
                    <div
                        className="absolute inset-y-0 right-0 w-1/2 h-full cursor-pointer"
                        onClick={onRightClick}
                        onMouseEnter={onRightHover}
                    />
                </>
            )}
        </div>
    );
};
