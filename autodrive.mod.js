(() => {
  const PART_SIZE = 5;
  const ROTATION_QUATERNIONS = [
    [
      [0, 0, 0, 1],
      [0, 0.7071067811865475, 0, 0.7071067811865476],
      [0, 1, 0, 0],
      [0, 0.7071067811865476, 0, -0.7071067811865475],
    ],
    [
      [0, 0, 1, 0],
      [0.7071067811865475, 0, 0.7071067811865476, 0],
      [1, 0, 0, 0],
      [0.7071067811865476, 0, -0.7071067811865475, 0],
    ],
    [
      [0, 0, -0.7071067811865477, 0.7071067811865475],
      [0.5, 0.5, -0.5, 0.5],
      [0.7071067811865475, 0.7071067811865477, 0, 0],
      [0.5, 0.5, 0.5, -0.5],
    ],
    [
      [0, 0, 0.7071067811865475, 0.7071067811865476],
      [0.5, -0.5, 0.5, 0.5],
      [0.7071067811865476, -0.7071067811865475, 0, 0],
      [0.5, -0.5, -0.5, -0.5],
    ],
    [
      [0.7071067811865475, 0, 0, 0.7071067811865476],
      [0.5, 0.5, 0.5, 0.5],
      [0, 0.7071067811865476, 0.7071067811865475, 0],
      [-0.5, 0.5, 0.5, -0.5],
    ],
    [
      [-0.7071067811865477, 0, 0, 0.7071067811865475],
      [-0.5, -0.5, 0.5, 0.5],
      [0, -0.7071067811865475, 0.7071067811865477, 0],
      [0.5, -0.5, 0.5, -0.5],
    ],
  ];

  const state = {
    enabled: true,
    current: null,
    badge: null,
  };

  function clonePosition(position) {
    return { x: position.x, y: position.y, z: position.z };
  }

  function getRotationQuaternion(rotation, rotationAxis) {
    const axisIndex = Number.isInteger(rotationAxis) ? rotationAxis : 0;
    const rotationIndex = ((rotation % 4) + 4) % 4;
    const row = ROTATION_QUATERNIONS[axisIndex] || ROTATION_QUATERNIONS[0];
    const q = row[rotationIndex] || row[0];
    return { x: q[0], y: q[1], z: q[2], w: q[3] };
  }

  function rotateVector(vector, quaternion) {
    const x = vector.x;
    const y = vector.y;
    const z = vector.z;
    const qx = quaternion.x;
    const qy = quaternion.y;
    const qz = quaternion.z;
    const qw = quaternion.w;

    const ix = qw * x + qy * z - qz * y;
    const iy = qw * y + qz * x - qx * z;
    const iz = qw * z + qx * y - qy * x;
    const iw = -qx * x - qy * y - qz * z;

    return {
      x: ix * qw + iw * -qx + iy * -qz - iz * -qy,
      y: iy * qw + iw * -qy + iz * -qx - ix * -qz,
      z: iz * qw + iw * -qz + ix * -qy - iy * -qx,
    };
  }

  function length2D(vector) {
    return Math.hypot(vector.x, vector.z);
  }

  function normalize2D(vector) {
    const length = length2D(vector);
    if (length < 1e-6) {
      return null;
    }

    return {
      x: vector.x / length,
      z: vector.z / length,
    };
  }

  function signedAngle(from, to) {
    return Math.atan2(from.x * to.z - from.z * to.x, from.x * to.x + from.z * to.z);
  }

  function getBodyForward(quaternion) {
    const forward = rotateVector({ x: 0, y: 0, z: 1 }, quaternion);
    return normalize2D(forward) || { x: 0, z: 1 };
  }

  function buildCheckpointCenters(track) {
    if (!track || typeof track.getCheckpoints !== "function") {
      return [];
    }

    const grouped = new Map();
    const checkpoints = track.getCheckpoints();
    for (const checkpoint of checkpoints) {
      if (!checkpoint || !checkpoint.detector) {
        continue;
      }

      const quaternion = getRotationQuaternion(checkpoint.rotation, checkpoint.rotationAxis);
      const rotatedCenter = rotateVector(
        {
          x: checkpoint.detector.center[0],
          y: checkpoint.detector.center[1],
          z: checkpoint.detector.center[2],
        },
        quaternion,
      );

      const worldCenter = {
        x: checkpoint.x * PART_SIZE + rotatedCenter.x,
        y: checkpoint.y * PART_SIZE + rotatedCenter.y,
        z: checkpoint.z * PART_SIZE + rotatedCenter.z,
      };

      const order = checkpoint.checkpointOrder;
      let group = grouped.get(order);
      if (!group) {
        group = [];
        grouped.set(order, group);
      }

      group.push(worldCenter);
    }

    return [...grouped.entries()]
      .sort((left, right) => left[0] - right[0])
      .map(([order, centers]) => {
        const summed = centers.reduce(
          (accumulator, center) => ({
            x: accumulator.x + center.x,
            y: accumulator.y + center.y,
            z: accumulator.z + center.z,
          }),
          { x: 0, y: 0, z: 0 },
        );

        return {
          order,
          x: summed.x / centers.length,
          y: summed.y / centers.length,
          z: summed.z / centers.length,
        };
      });
  }

  function ensureBadge() {
    if (state.badge) {
      return state.badge;
    }

    const host = document.getElementById("ui") || document.body;
    const badge = document.createElement("div");
    badge.style.position = "absolute";
    badge.style.top = "12px";
    badge.style.right = "12px";
    badge.style.zIndex = "200";
    badge.style.padding = "6px 10px";
    badge.style.background = "rgba(9, 14, 34, 0.82)";
    badge.style.border = "1px solid rgba(170, 205, 255, 0.35)";
    badge.style.color = "#d8ebff";
    badge.style.fontFamily = "monospace";
    badge.style.fontSize = "12px";
    badge.style.pointerEvents = "none";
    badge.style.whiteSpace = "pre";
    badge.textContent = "AUTO DRIVE ON\nWaiting for player car";
    host.appendChild(badge);
    state.badge = badge;
    return badge;
  }

  function updateBadge(message) {
    ensureBadge().textContent = message;
  }

  function setControlValue(controls, key, value) {
    if (controls[key] !== value) {
      controls[key] = value;
    }
  }

  function applyControls(entry, nextControls) {
    if (!entry || !entry.controls) {
      return;
    }

    setControlValue(entry.controls, "up", nextControls.up);
    setControlValue(entry.controls, "right", nextControls.right);
    setControlValue(entry.controls, "down", nextControls.down);
    setControlValue(entry.controls, "left", nextControls.left);
    setControlValue(entry.controls, "reset", false);
  }

  function releaseControls(entry) {
    applyControls(entry, {
      up: false,
      right: false,
      down: false,
      left: false,
    });
  }

  function getTargetCheckpoint(entry, checkpointIndex) {
    if (!entry || entry.checkpoints.length === 0) {
      return null;
    }

    const index = Math.max(0, Math.min(entry.checkpoints.length - 1, checkpointIndex));
    return entry.checkpoints[index] || null;
  }

  function computeAiControls(carState, entry) {
    const position = carState.position;
    const targetCheckpoint = getTargetCheckpoint(entry, carState.nextCheckpointIndex || 0);
    const groundedWheels = (carState.wheelContact || []).filter(Boolean).length;
    const speedKmh = Math.max(0, carState.speedKmh || 0);

    const bodyForward = getBodyForward(carState.quaternion);
    let motionForward = null;
    if (entry.previousPosition) {
      motionForward = normalize2D({
        x: position.x - entry.previousPosition.x,
        z: position.z - entry.previousPosition.z,
      });
    }

    const heading = motionForward || bodyForward;
    let targetDirection = bodyForward;
    if (targetCheckpoint) {
      targetDirection =
        normalize2D({
          x: targetCheckpoint.x - position.x,
          z: targetCheckpoint.z - position.z,
        }) || targetDirection;
    }

    const targetAngle = signedAngle(heading, targetDirection);
    const slipAngle = motionForward && speedKmh > 25 ? signedAngle(bodyForward, motionForward) : 0;
    const desiredAngle = targetAngle - 0.45 * slipAngle;
    const angleMagnitude = Math.abs(desiredAngle);

    const shouldBrake =
      groundedWheels >= 2 &&
      ((speedKmh > 125 && angleMagnitude > 0.55) ||
        (speedKmh > 95 && angleMagnitude > 0.8) ||
        (speedKmh > 70 && angleMagnitude > 1.1));

    const shouldThrottle =
      !shouldBrake &&
      (angleMagnitude < 0.18 ||
        speedKmh < 45 ||
        (angleMagnitude < 0.75 && speedKmh < 100)) &&
      !(angleMagnitude > 0.95 && speedKmh > 60);

    const steerDeadzone = speedKmh > 100 ? 0.05 : 0.035;
    const steerRight = desiredAngle > steerDeadzone;
    const steerLeft = desiredAngle < -steerDeadzone;

    return {
      up: shouldThrottle,
      down: shouldBrake,
      right: steerRight,
      left: steerLeft,
      debug: {
        speedKmh,
        checkpoint: targetCheckpoint ? targetCheckpoint.order + 1 : null,
      },
    };
  }

  function registerCar(car, context) {
    if (!context || !context.controls) {
      return;
    }

    if (
      typeof context.controls.getControls !== "function" ||
      typeof context.controls.addChangeCallback !== "function"
    ) {
      return;
    }

    state.current = {
      car,
      controls: context.controls,
      checkpoints: buildCheckpointCenters(context.track),
      previousPosition: null,
    };

    updateBadge(
      state.enabled
        ? "AUTO DRIVE ON\nTracking player car [F8]"
        : "AUTO DRIVE OFF\nManual input restored [F8]",
    );
  }

  function beforeCarUpdate(car) {
    const entry = state.current;
    if (!entry || entry.car !== car || typeof car.getCarState !== "function") {
      return;
    }

    const carState = car.getCarState();
    if (!carState || !carState.position) {
      return;
    }

    if (!state.enabled) {
      releaseControls(entry);
      updateBadge("AUTO DRIVE OFF\nManual input restored [F8]");
      entry.previousPosition = clonePosition(carState.position);
      return;
    }

    if (car.isControlsDisabled === true) {
      releaseControls(entry);
      updateBadge("AUTO DRIVE PAUSED\nGame controls disabled [F8]");
      entry.previousPosition = clonePosition(carState.position);
      return;
    }

    if (carState.finishFrames != null) {
      releaseControls(entry);
      updateBadge("AUTO DRIVE ON\nRun finished [F8]");
      entry.previousPosition = clonePosition(carState.position);
      return;
    }

    const controls = computeAiControls(carState, entry);
    applyControls(entry, controls);
    entry.previousPosition = clonePosition(carState.position);

    const checkpointLabel =
      controls.debug.checkpoint == null
        ? "Searching track"
        : `Checkpoint ${controls.debug.checkpoint}`;

    updateBadge(
      `AUTO DRIVE ON\n${checkpointLabel}\n${Math.round(controls.debug.speedKmh)} km/h [F8]`,
    );
  }

  function unregisterCar(car) {
    if (!state.current || state.current.car !== car) {
      return;
    }

    releaseControls(state.current);
    state.current = null;
    updateBadge(state.enabled ? "AUTO DRIVE ON\nWaiting for player car [F8]" : "AUTO DRIVE OFF\n[F8]");
  }

  function setEnabled(enabled) {
    state.enabled = Boolean(enabled);
    if (!state.enabled && state.current) {
      releaseControls(state.current);
    }

    updateBadge(
      state.enabled
        ? state.current
          ? "AUTO DRIVE ON\nTracking player car [F8]"
          : "AUTO DRIVE ON\nWaiting for player car [F8]"
        : "AUTO DRIVE OFF\nManual input restored [F8]",
    );
  }

  window.addEventListener("keydown", (event) => {
    if (event.code === "F8" && !event.repeat) {
      setEnabled(!state.enabled);
      event.preventDefault();
    }
  });

  window.__polytrackAutoDriveMod = {
    beforeCarUpdate,
    registerCar,
    unregisterCar,
    toggle() {
      setEnabled(!state.enabled);
    },
    setEnabled,
    get isEnabled() {
      return state.enabled;
    },
  };

  ensureBadge();
})();
