"""SM-2 spaced repetition scheduling.

Ratings: 1=Again, 2=Hard, 3=Good, 4=Easy.
Pure function over (current state, rating, today) so it is easy to unit-test.
"""

from dataclasses import dataclass
from datetime import date, timedelta

MIN_EASE = 1.3


@dataclass
class SrsState:
    interval: int  # days
    ease_factor: float
    repetitions: int
    lapses: int


def review(state: SrsState, rating: int, today: date) -> tuple[SrsState, str]:
    """Apply one review. Returns (new state, new due_date ISO string)."""
    if rating not in (1, 2, 3, 4):
        raise ValueError(f"rating must be 1-4, got {rating}")

    ef = state.ease_factor

    if rating == 1:  # Again: reset, card comes back today
        new = SrsState(
            interval=0,
            ease_factor=max(MIN_EASE, ef - 0.2),
            repetitions=0,
            lapses=state.lapses + 1,
        )
        return new, today.isoformat()

    repetitions = state.repetitions + 1
    if repetitions == 1:
        interval = 1
    elif repetitions == 2:
        interval = 6
    else:
        interval = round(state.interval * ef)

    if rating == 2:  # Hard: shorter step, lower ease
        ef = max(MIN_EASE, ef - 0.15)
        interval = max(1, round(interval * 0.8))
    elif rating == 4:  # Easy: longer step, higher ease
        ef = ef + 0.15
        interval = max(1, round(interval * 1.3))

    interval = max(1, interval)
    new = SrsState(
        interval=interval,
        ease_factor=ef,
        repetitions=repetitions,
        lapses=state.lapses,
    )
    return new, (today + timedelta(days=interval)).isoformat()
