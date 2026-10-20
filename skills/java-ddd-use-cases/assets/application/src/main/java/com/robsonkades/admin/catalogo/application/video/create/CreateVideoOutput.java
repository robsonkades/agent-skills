package com.robsonkades.admin.catalogo.application.video.create;

import com.robsonkades.admin.catalogo.domain.video.Video;

public record CreateVideoOutput(String id) {

    public static CreateVideoOutput from(final Video aVideo) {
        return new CreateVideoOutput(aVideo.getId().getValue());
    }
}
