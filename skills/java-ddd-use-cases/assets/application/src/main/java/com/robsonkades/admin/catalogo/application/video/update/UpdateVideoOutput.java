package com.robsonkades.admin.catalogo.application.video.update;

import com.robsonkades.admin.catalogo.domain.video.Video;

public record UpdateVideoOutput(String id) {

    public static UpdateVideoOutput from(final Video aVideo) {
        return new UpdateVideoOutput(aVideo.getId().getValue());
    }
}
