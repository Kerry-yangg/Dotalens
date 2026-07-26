package opendota;

import java.io.IOException;

final class ReplayIdentityException extends IOException {
    private final long declaredMatchId;
    private final long internalMatchId;

    ReplayIdentityException(long declaredMatchId, long internalMatchId) {
        super("Replay internal match ID " + internalMatchId
                + " does not match declared match ID " + declaredMatchId);
        this.declaredMatchId = declaredMatchId;
        this.internalMatchId = internalMatchId;
    }

    long declaredMatchId() {
        return declaredMatchId;
    }

    long internalMatchId() {
        return internalMatchId;
    }
}
